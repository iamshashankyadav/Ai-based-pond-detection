import os
import io
import zipfile
import math
import xml.etree.ElementTree as ET
import numpy as np
from scipy.interpolate import griddata
from typing import Dict, Any, List, Tuple, Optional

from services.hydrology_service import hydrology_service
from services.rainfall_service import rainfall_service
from services.runoff_pond_service import runoff_pond_service
from services.elevation_service import elevation_service

class KMLContourService:
    """
    Parser and hydrological analysis engine for KML / KMZ contour maps.
    Parses contour vectors, interpolates DEM raster grid, delineates catchment basins,
    and generates pond sizing recommendations.
    """

    def parse_kml_content(self, kml_bytes: bytes) -> Dict[str, Any]:
        """
        Parses KML XML content and extracts all contour line features with elevation.
        """
        try:
            root = ET.fromstring(kml_bytes)
        except Exception as e:
            # Handle potential XML namespace stripping or UTF-8 decode
            text = kml_bytes.decode('utf-8', errors='ignore')
            root = ET.fromstring(text)

        # Namespace map
        ns = {'kml': 'http://www.opengis.net/kml/2.2'}

        # Find all placemarks (with or without namespace)
        placemarks = root.findall('.//kml:Placemark', ns)
        if not placemarks:
            placemarks = root.findall('.//Placemark')

        contour_lines = []
        all_lats = []
        all_lons = []
        all_elevations = []
        point_cloud = [] # (lon, lat, elev)

        for pm in placemarks:
            # Extract elevation from <name> or <ExtendedData>
            name_elem = pm.find('kml:name', ns) if pm.find('kml:name', ns) is not None else pm.find('name')
            elevation = None

            if name_elem is not None and name_elem.text:
                try:
                    elevation = float(name_elem.text.strip())
                except ValueError:
                    pass

            if elevation is None:
                # Try ExtendedData SimpleData
                for sd in pm.findall('.//kml:SimpleData', ns) + pm.findall('.//SimpleData'):
                    val = sd.text or ""
                    try:
                        elevation = float(val)
                        break
                    except ValueError:
                        continue

            if elevation is None:
                elevation = 280.0 # fallback baseline

            # Extract coordinates from LineString or Polygon
            coord_elems = pm.findall('.//kml:coordinates', ns) + pm.findall('.//coordinates')
            for ce in coord_elems:
                if not ce.text:
                    continue
                coord_text = ce.text.strip()
                raw_coords = coord_text.split()
                line_coords = []

                for tuple_str in raw_coords:
                    parts = tuple_str.split(',')
                    if len(parts) >= 2:
                        try:
                            lon = float(parts[0])
                            lat = float(parts[1])
                            elev_z = float(parts[2]) if len(parts) >= 3 else elevation

                            line_coords.append([round(lon, 6), round(lat, 6)])
                            all_lons.append(lon)
                            all_lats.append(lat)
                            all_elevations.append(elevation)
                            point_cloud.append((lon, lat, elevation))
                        except ValueError:
                            continue

                if len(line_coords) >= 2:
                    contour_lines.append({
                        "elevation_m": elevation,
                        "coordinates": line_coords
                    })

        if not all_lats or not all_lons:
            raise ValueError("No valid contour coordinates found in the provided KML/KMZ file.")

        min_lat, max_lat = min(all_lats), max(all_lats)
        min_lon, max_lon = min(all_lons), max(all_lons)
        min_elev, max_elev = min(all_elevations), max(all_elevations)

        # Convert to GeoJSON FeatureCollection
        geojson_features = []
        for line in contour_lines:
            elev = line["elevation_m"]
            norm = (elev - min_elev) / (max_elev - min_elev + 1e-6)
            color = elevation_service._elevation_to_color(norm)
            is_index = (int(elev) % 5 == 0)

            geojson_features.append({
                "type": "Feature",
                "properties": {
                    "elevation_m": elev,
                    "level_label": f"{elev} m",
                    "color": color,
                    "weight": 2.2 if is_index else 1.2,
                    "is_index_contour": is_index
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": line["coordinates"]
                }
            })

        return {
            "bbox": [round(min_lat, 6), round(min_lon, 6), round(max_lat, 6), round(max_lon, 6)],
            "elevation_stats": {
                "min_elevation_m": round(min_elev, 2),
                "max_elevation_m": round(max_elev, 2),
                "relief_m": round(max_elev - min_elev, 2),
                "contour_count": len(contour_lines),
                "total_points": len(point_cloud)
            },
            "point_cloud": point_cloud,
            "contours_geojson": {
                "type": "FeatureCollection",
                "features": geojson_features
            }
        }

    def interpolate_dem_from_contours(
        self,
        point_cloud: List[Tuple[float, float, float]],
        bbox: List[float],
        grid_size: int = 50
    ) -> Dict[str, Any]:
        """
        Interpolates contour point cloud into a regular DEM elevation grid using Delaunay triangulation.
        """
        min_lat, min_lon, max_lat, max_lon = bbox
        lats = np.linspace(min_lat, max_lat, grid_size)
        lons = np.linspace(min_lon, max_lon, grid_size)
        lon_grid, lat_grid = np.meshgrid(lons, lats)

        # Subsample point cloud if too dense for fast interpolation
        if len(point_cloud) > 8000:
            step = len(point_cloud) // 6000
            sampled_cloud = point_cloud[::step]
        else:
            sampled_cloud = point_cloud

        pts = np.array([[p[0], p[1]] for p in sampled_cloud]) # (lon, lat)
        vals = np.array([p[2] for p in sampled_cloud])        # elevation

        # Linear interpolation with nearest neighbor fallback for corners
        grid_z = griddata(pts, vals, (lon_grid, lat_grid), method='linear')
        grid_nearest = griddata(pts, vals, (lon_grid, lat_grid), method='nearest')
        grid_z[np.isnan(grid_z)] = grid_nearest[np.isnan(grid_z)]

        grid_z = np.round(grid_z, 2)

        # Compute slope grid
        dx = (lons[1] - lons[0]) * 105000.0
        dy = (lats[1] - lats[0]) * 111000.0
        gy, gx = np.gradient(grid_z, dy, dx)
        slope_grid = np.round(np.sqrt(gx**2 + gy**2) * 100.0, 2)

        return {
            "lats": lats.tolist(),
            "lons": lons.tolist(),
            "elevation_grid": grid_z.tolist(),
            "slope_grid": slope_grid.tolist()
        }

    async def analyze_kml_file(
        self,
        file_bytes: bytes,
        filename: str = "contour.kml",
        pour_lat: Optional[float] = None,
        pour_lon: Optional[float] = None,
        target_capture_pct: float = 25.0
    ) -> Dict[str, Any]:
        """
        End-to-end KML / KMZ contour analyzer:
        1. Parses contours
        2. Interpolates DEM
        3. Detects optimal depression sinks
        4. Delineates D8 catchment watershed
        5. Fetches live rainfall
        6. Computes runoff and frustum pond dimensions
        """
        # Unzip if KMZ
        if filename.lower().endswith('.kmz') or file_bytes[:2] == b'PK':
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
                kml_names = [n for n in z.namelist() if n.lower().endswith('.kml')]
                if not kml_names:
                    raise ValueError("No .kml document found inside the KMZ archive.")
                kml_bytes = z.read(kml_names[0])
        else:
            kml_bytes = file_bytes

        # 1. Parse Contours
        parsed = self.parse_kml_content(kml_bytes)
        bbox = parsed["bbox"]
        min_lat, min_lon, max_lat, max_lon = bbox

        # 2. Interpolate DEM Grid
        dem_data = self.interpolate_dem_from_contours(parsed["point_cloud"], bbox, grid_size=55)

        # 3. Detect Natural Depression Sinks in the real contour terrain
        sinks = elevation_service.detect_natural_sinks(
            lats=dem_data["lats"],
            lons=dem_data["lons"],
            elev_grid=dem_data["elevation_grid"],
            slope_grid=dem_data["slope_grid"],
            max_sinks=5
        )

        # 4. Determine Pour Point (use user provided coordinate, or highest-ranked natural sink, or centroid)
        if pour_lat is not None and pour_lon is not None:
            chosen_lat = pour_lat
            chosen_lon = pour_lon
            sink_note = "User-specified candidate pond pour point"
        elif sinks:
            chosen_lat = sinks[0]["lat"]
            chosen_lon = sinks[0]["lon"]
            sink_note = f"Optimal Natural Depression Sink (Suitability: {sinks[0]['suitability_score']}%)"
        else:
            chosen_lat = (min_lat + max_lat) / 2.0
            chosen_lon = (min_lon + max_lon) / 2.0
            sink_note = "Terrain Centroid Basin"

        # 5. Delineate D8 Catchment Basin
        catchment_geojson = hydrology_service.delineate_catchment(
            pour_lat=chosen_lat,
            pour_lon=chosen_lon,
            lats=dem_data["lats"],
            lons=dem_data["lons"],
            elev_grid=dem_data["elevation_grid"]
        )

        catchment_props = catchment_geojson["properties"]
        catchment_area_m2 = catchment_props["area_sq_meters"]
        avg_slope = catchment_props["avg_slope_percent"]

        # 6. Live Open-Meteo Rainfall Data for the KML centroid
        rainfall_data = await rainfall_service.get_historical_rainfall(lat=chosen_lat, lon=chosen_lon, years=5)
        annual_rainfall_mm = rainfall_data["annual_rainfall_mm"]

        # 7. Runoff Volume Estimation
        runoff_data = runoff_pond_service.estimate_runoff(
            catchment_area_m2=catchment_area_m2,
            annual_rainfall_mm=annual_rainfall_mm,
            land_use="cultivated_clay_loam",
            monthly_distribution=rainfall_data.get("monthly_distribution", [])
        )

        # 8. Frustum Pond Dimension Recommendation
        pond_recommendation = runoff_pond_service.recommend_pond_sizing(
            annual_runoff_m3=runoff_data["annual_runoff_volume_m3"],
            catchment_area_m2=catchment_area_m2,
            slope_percent=avg_slope,
            target_capture_pct=target_capture_pct
        )

        return {
            "status": "success",
            "file_info": {
                "filename": filename,
                "bbox": bbox,
                "elevation_stats": parsed["elevation_stats"]
            },
            "selected_pond_site": {
                "lat": chosen_lat,
                "lon": chosen_lon,
                "type": sink_note
            },
            "elevation": {
                "stats": parsed["elevation_stats"],
                "contours_geojson": parsed["contours_geojson"],
                "natural_sinks": sinks
            },
            "catchment": catchment_geojson,
            "rainfall": rainfall_data,
            "runoff": runoff_data,
            "pond_recommendation": pond_recommendation
        }

kml_contour_service = KMLContourService()

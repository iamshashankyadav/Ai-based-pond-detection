import os
import math
import logging
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional

import httpx
import numpy as np
from dotenv import load_dotenv

# Load .env from project root or current working directory
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv()

logger = logging.getLogger("elevation_service")

# Chhattisgarh baseline elevation range (m above sea level) fallback
BASE_ELEVATION_BHILAI = 295.0
OPENTOPOGRAPHY_API_URL = "https://portal.opentopography.org/API/globaldem"

class ElevationService:
    def __init__(self):
        self.api_key = os.getenv("OPENTOPOGRAPHY_API_KEY", "").strip()
        self.client = httpx.AsyncClient(timeout=30.0)

    async def get_elevation_grid(
        self,
        min_lat: float,
        min_lon: float,
        max_lat: float,
        max_lon: float,
        grid_size: Optional[int] = None,
        dataset: str = "SRTMGL1"
    ) -> Dict[str, Any]:
        """
        Fetches real DEM elevation raster from OpenTopography API (SRTM 30m / COP30).
        Falls back to regional topographic model if the API is offline or key is missing.
        """
        api_key = os.getenv("OPENTOPOGRAPHY_API_KEY", self.api_key).strip()

        if api_key:
            try:
                return await self._fetch_opentopography_grid(
                    min_lat=min_lat,
                    min_lon=min_lon,
                    max_lat=max_lat,
                    max_lon=max_lon,
                    api_key=api_key,
                    dataset=dataset
                )
            except Exception as e:
                logger.warning(f"Failed to fetch DEM from OpenTopography: {e}. Falling back to synthetic DEM.")
        else:
            logger.warning("OPENTOPOGRAPHY_API_KEY not configured. Falling back to synthetic DEM.")

        return self._generate_synthetic_grid(min_lat, min_lon, max_lat, max_lon, grid_size=grid_size or 50)

    async def _fetch_opentopography_grid(
        self,
        min_lat: float,
        min_lon: float,
        max_lat: float,
        max_lon: float,
        api_key: str,
        dataset: str = "SRTMGL1"
    ) -> Dict[str, Any]:
        import rasterio
        from rasterio.io import MemoryFile

        params = {
            "demtype": dataset,
            "south": min_lat,
            "north": max_lat,
            "west": min_lon,
            "east": max_lon,
            "outputFormat": "GTiff",
            "API_Key": api_key,
        }

        resp = await self.client.get(OPENTOPOGRAPHY_API_URL, params=params)
        resp.raise_for_status()

        if resp.headers.get("content-type", "").startswith("application/json"):
            raise RuntimeError(f"OpenTopography API returned error: {resp.text[:300]}")

        with MemoryFile(resp.content) as memfile:
            with memfile.open() as src:
                elev = src.read(1).astype(np.float64)
                nodata = src.nodata
                if nodata is not None:
                    elev[elev == nodata] = np.nan
                height, width = elev.shape
                transform = src.transform
                xs = np.arange(width)
                ys = np.arange(height)
                lons = transform.c + xs * transform.a
                lats = transform.f + ys * transform.e  # negative step, north -> south

        # Flip so row 0 = south, matching standard np.linspace(min_lat, max_lat) grid
        elev = np.flipud(elev)
        lats = lats[::-1]

        # Handle any NaN/nodata cells using nearest-neighbor fill
        if np.isnan(elev).any():
            from scipy import ndimage
            mask = np.isnan(elev)
            if mask.all():
                raise RuntimeError("OpenTopography returned all NaN values for requested bounding box.")
            idx = ndimage.distance_transform_edt(mask, return_distances=False, return_indices=True)
            elev = elev[tuple(idx)]

        # Calculate slope grid (in percentage)
        dx = abs(lons[1] - lons[0]) * 105000.0 if len(lons) > 1 else 30.0
        dy = abs(lats[1] - lats[0]) * 111000.0 if len(lats) > 1 else 30.0

        gy, gx = np.gradient(elev, dy, dx)
        slope_grid = np.sqrt(gx ** 2 + gy ** 2) * 100.0

        min_elev = float(np.nanmin(elev))
        max_elev = float(np.nanmax(elev))
        mean_elev = float(np.nanmean(elev))

        return {
            "lats": lats.tolist(),
            "lons": lons.tolist(),
            "elevation_grid": np.round(elev, 2).tolist(),
            "slope_grid": np.round(slope_grid, 2).tolist(),
            "stats": {
                "min_elevation_m": round(min_elev, 2),
                "max_elevation_m": round(max_elev, 2),
                "mean_elevation_m": round(mean_elev, 2),
                "relief_m": round(max_elev - min_elev, 2),
                "avg_slope_percent": round(float(np.nanmean(slope_grid)), 2),
                "grid_resolution_m": round(float(dx), 1),
                "grid_shape": list(elev.shape),
                "data_source": f"OpenTopography ({dataset} 30m Real DEM)"
            }
        }

    def _generate_synthetic_grid(
        self,
        min_lat: float,
        min_lon: float,
        max_lat: float,
        max_lon: float,
        grid_size: int = 50
    ) -> Dict[str, Any]:
        """
        Fallback synthetic DEM grid generator based on Chhattisgarh basin gradients.
        """
        lats = np.linspace(min_lat, max_lat, grid_size)
        lons = np.linspace(min_lon, max_lon, grid_size)
        lon_grid, lat_grid = np.meshgrid(lons, lats)

        center_lat = (min_lat + max_lat) / 2.0
        center_lon = (min_lon + max_lon) / 2.0

        d_lat = (lat_grid - center_lat) * 111.0  # km
        d_lon = (lon_grid - center_lon) * 105.0  # km

        regional_tilt = -1.8 * d_lon + 1.2 * d_lat
        wave1 = 6.5 * np.sin(d_lat * 2.5 + d_lon * 1.8)
        wave2 = 4.2 * np.cos(d_lat * 4.2 - d_lon * 3.1)
        wave3 = 2.5 * np.sin(np.sqrt(d_lat**2 + d_lon**2) * 5.0)

        depression = -5.0 * np.exp(-((d_lat - 0.2)**2 + (d_lon + 0.15)**2) / 0.15)
        depression2 = -4.2 * np.exp(-((d_lat + 0.3)**2 + (d_lon - 0.25)**2) / 0.2)

        elev_grid = BASE_ELEVATION_BHILAI + regional_tilt + wave1 + wave2 + wave3 + depression + depression2
        elev_grid = np.round(elev_grid, 2)

        min_elev = float(np.min(elev_grid))
        max_elev = float(np.max(elev_grid))
        mean_elev = float(np.mean(elev_grid))

        dx = (lons[1] - lons[0]) * 105000.0
        dy = (lats[1] - lats[0]) * 111000.0

        gy, gx = np.gradient(elev_grid, dy, dx)
        slope_grid = np.sqrt(gx**2 + gy**2) * 100.0

        return {
            "lats": lats.tolist(),
            "lons": lons.tolist(),
            "elevation_grid": elev_grid.tolist(),
            "slope_grid": np.round(slope_grid, 2).tolist(),
            "stats": {
                "min_elevation_m": min_elev,
                "max_elevation_m": max_elev,
                "mean_elevation_m": round(mean_elev, 2),
                "relief_m": round(max_elev - min_elev, 2),
                "avg_slope_percent": round(float(np.mean(slope_grid)), 2),
                "grid_resolution_m": round(float(dx), 1),
                "grid_shape": list(elev_grid.shape),
                "data_source": "Synthetic Regional Topography Model (Fallback)"
            }
        }

    def generate_contours(
        self,
        lats: List[float],
        lons: List[float],
        elev_grid: List[List[float]],
        contour_interval: float = 2.5
    ) -> Dict[str, Any]:
        """
        Generates GeoJSON contour lines (Marching Squares / isocontours) from the DEM grid.
        """
        grid = np.array(elev_grid)
        lats_arr = np.array(lats)
        lons_arr = np.array(lons)

        min_elev = math.floor(np.min(grid) / contour_interval) * contour_interval
        max_elev = math.ceil(np.max(grid) / contour_interval) * contour_interval

        levels = np.arange(min_elev, max_elev + contour_interval, contour_interval)
        features = []

        rows, cols = grid.shape

        for level in levels:
            level_float = round(float(level), 1)
            segments = []

            # Marching Squares isocontour extraction on cells
            for r in range(rows - 1):
                for c in range(cols - 1):
                    # 4 cell corners
                    v0 = grid[r, c]         # Top-left
                    v1 = grid[r, c + 1]     # Top-right
                    v2 = grid[r + 1, c + 1] # Bottom-right
                    v3 = grid[r + 1, c]     # Bottom-left

                    # Binary classification
                    b0 = int(v0 >= level)
                    b1 = int(v1 >= level)
                    b2 = int(v2 >= level)
                    b3 = int(v3 >= level)
                    case = (b0 << 3) | (b1 << 2) | (b2 << 1) | b3

                    if case == 0 or case == 15:
                        continue

                    # Edge interpolation helpers
                    # Edge 0 (top): between (r, c) and (r, c+1)
                    def top_pt():
                        t = (level - v0) / (v1 - v0 + 1e-7)
                        t = max(0.0, min(1.0, t))
                        lon = lons_arr[c] + t * (lons_arr[c + 1] - lons_arr[c])
                        lat = lats_arr[r]
                        return [round(float(lon), 6), round(float(lat), 6)]

                    # Edge 1 (right): between (r, c+1) and (r+1, c+1)
                    def right_pt():
                        t = (level - v1) / (v2 - v1 + 1e-7)
                        t = max(0.0, min(1.0, t))
                        lon = lons_arr[c + 1]
                        lat = lats_arr[r] + t * (lats_arr[r + 1] - lats_arr[r])
                        return [round(float(lon), 6), round(float(lat), 6)]

                    # Edge 2 (bottom): between (r+1, c) and (r+1, c+1)
                    def bottom_pt():
                        t = (level - v3) / (v2 - v3 + 1e-7)
                        t = max(0.0, min(1.0, t))
                        lon = lons_arr[c] + t * (lons_arr[c + 1] - lons_arr[c])
                        lat = lats_arr[r + 1]
                        return [round(float(lon), 6), round(float(lat), 6)]

                    # Edge 3 (left): between (r, c) and (r+1, c)
                    def left_pt():
                        t = (level - v0) / (v3 - v0 + 1e-7)
                        t = max(0.0, min(1.0, t))
                        lon = lons_arr[c]
                        lat = lats_arr[r] + t * (lats_arr[r + 1] - lats_arr[r])
                        return [round(float(lon), 6), round(float(lat), 6)]

                    # Marching squares segment table
                    if case in (1, 14):
                        segments.append([left_pt(), bottom_pt()])
                    elif case in (2, 13):
                        segments.append([bottom_pt(), right_pt()])
                    elif case in (3, 12):
                        segments.append([left_pt(), right_pt()])
                    elif case in (4, 11):
                        segments.append([top_pt(), right_pt()])
                    elif case in (5, 10):
                        segments.append([left_pt(), top_pt()])
                        segments.append([bottom_pt(), right_pt()])
                    elif case in (6, 9):
                        segments.append([top_pt(), bottom_pt()])
                    elif case in (7, 8):
                        segments.append([left_pt(), top_pt()])

            if segments:
                # Color code contour lines by elevation gradient
                norm = (level - min_elev) / (max_elev - min_elev + 1e-6)
                color = self._elevation_to_color(norm)
                is_index = (int(level) % 10 == 0)

                features.append({
                    "type": "Feature",
                    "properties": {
                        "elevation_m": level_float,
                        "level_label": f"{level_float} m",
                        "is_index_contour": is_index,
                        "color": color,
                        "weight": 2.2 if is_index else 1.2,
                        "opacity": 0.85 if is_index else 0.65
                    },
                    "geometry": {
                        "type": "MultiLineString",
                        "coordinates": segments
                    }
                })

        return {
            "type": "FeatureCollection",
            "properties": {
                "contour_interval_m": contour_interval,
                "levels_count": len(levels),
                "min_elevation": min_elev,
                "max_elevation": max_elev
            },
            "features": features
        }

    def detect_natural_sinks(
        self,
        lats: List[float],
        lons: List[float],
        elev_grid: List[List[float]],
        slope_grid: List[List[float]],
        max_sinks: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Identifies natural topographic depressions / sinks suitable for village pond siting.
        Criteria: Local elevation minimum, slope < 5%, natural runoff drainage confluence.
        """
        grid = np.array(elev_grid)
        slopes = np.array(slope_grid)
        rows, cols = grid.shape

        sinks = []

        for r in range(2, rows - 2):
            for c in range(2, cols - 2):
                local_window = grid[r-1:r+2, c-1:c+2]
                center_val = grid[r, c]
                slope_val = slopes[r, c]

                # Check if it's a local minimum and gentle slope (<5%)
                if center_val == np.min(local_window) and slope_val < 5.0:
                    depth_depression = float(np.mean(grid[r-2:r+3, c-2:c+3]) - center_val)
                    score = max(0.0, min(100.0, (1.0 - slope_val / 5.0) * 50 + depth_depression * 20 + 30))

                    sinks.append({
                        "id": f"sink-{r}-{c}",
                        "lat": round(float(lats[r]), 6),
                        "lon": round(float(lons[c]), 6),
                        "elevation_m": round(float(center_val), 1),
                        "slope_percent": round(float(slope_val), 1),
                        "depression_depth_m": round(float(depth_depression), 2),
                        "suitability_score": round(score, 1),
                        "recommendation": "High Natural Catchment Sink - Optimal for Village Pond"
                    })

        # Sort by suitability score descending
        sinks.sort(key=lambda s: s["suitability_score"], reverse=True)
        return sinks[:max_sinks]

    def _elevation_to_color(self, norm: float) -> str:
        """Terrain elevation color ramp: Low (Cyan/Blue) -> Mid (Emerald/Yellow) -> High (Amber/Red)"""
        norm = max(0.0, min(1.0, norm))
        if norm < 0.25:
            return "#00f2fe" # Cyan
        elif norm < 0.5:
            return "#10b981" # Emerald
        elif norm < 0.75:
            return "#facc15" # Yellow
        else:
            return "#f97316" # Orange-Amber

elevation_service = ElevationService()

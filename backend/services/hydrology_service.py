import numpy as np
from typing import List, Dict, Any, Tuple, Optional
import math

class HydrologyService:
    """
    Hydrology analysis engine implementing D8 flow direction routing,
    flow accumulation, and upstream catchment / watershed delineation.
    """

    # D8 Direction Encoded Powers of 2:
    # [ [32 (NW), 64 (N), 128 (NE)],
    #   [16 (W) ,  0 (X),   1 (E) ],
    #   [ 8 (SW),  4 (S),   2 (SE)] ]
    D8_OFFSETS = [
        (-1, 0, 64),   # North
        (-1, 1, 128),  # North-East
        (0, 1, 1),     # East
        (1, 1, 2),     # South-East
        (1, 0, 4),     # South
        (1, -1, 8),    # South-West
        (0, -1, 16),   # West
        (-1, -1, 32)   # North-West
    ]

    def compute_d8_flow_direction(
        self,
        elev_grid: np.ndarray,
        cell_size_x: float,
        cell_size_y: float
    ) -> np.ndarray:
        """
        Computes D8 flow direction grid where each cell points to its steepest downhill neighbor.
        """
        rows, cols = elev_grid.shape
        flow_dir = np.zeros((rows, cols), dtype=np.int32)

        for r in range(rows):
            for c in range(cols):
                center_elev = elev_grid[r, c]
                max_slope = -1e9
                steepest_dir = 0

                for dr, dc, code in self.D8_OFFSETS:
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < rows and 0 <= nc < cols:
                        dist = math.sqrt((dr * cell_size_y)**2 + (dc * cell_size_x)**2)
                        drop = center_elev - elev_grid[nr, nc]
                        slope = drop / (dist + 1e-6)

                        if slope > max_slope and drop > 0:
                            max_slope = slope
                            steepest_dir = code

                flow_dir[r, c] = steepest_dir

        return flow_dir

    def compute_flow_accumulation(self, flow_dir: np.ndarray) -> np.ndarray:
        """
        Computes flow accumulation matrix (number of upstream cells draining through each cell).
        """
        rows, cols = flow_dir.shape
        acc = np.ones((rows, cols), dtype=np.float32)

        # In-degree count for topological sorting
        in_degree = np.zeros((rows, cols), dtype=np.int32)
        target_map = {}

        for r in range(rows):
            for c in range(cols):
                code = flow_dir[r, c]
                if code > 0:
                    for dr, dc, c_code in self.D8_OFFSETS:
                        if code == c_code:
                            nr, nc = r + dr, c + dc
                            if 0 <= nr < rows and 0 <= nc < cols:
                                in_degree[nr, nc] += 1
                                target_map[(r, c)] = (nr, nc)
                            break

        # Queue of headwater sources (in-degree == 0)
        queue = [(r, c) for r in range(rows) for c in range(cols) if in_degree[r, c] == 0]

        while queue:
            curr_r, curr_c = queue.pop(0)
            if (curr_r, curr_c) in target_map:
                tr, tc = target_map[(curr_r, curr_c)]
                acc[tr, tc] += acc[curr_r, curr_c]
                in_degree[tr, tc] -= 1
                if in_degree[tr, tc] == 0:
                    queue.append((tr, tc))

        return acc

    def delineate_catchment(
        self,
        pour_lat: float,
        pour_lon: float,
        lats: List[float],
        lons: List[float],
        elev_grid: List[List[float]]
    ) -> Dict[str, Any]:
        """
        Traces all upstream cells that drain into the given pour point (candidate pond location).
        Returns Catchment GeoJSON Polygon and hydrological metrics.
        """
        grid = np.array(elev_grid, dtype=np.float32)
        lats_arr = np.array(lats)
        lons_arr = np.array(lons)
        rows, cols = grid.shape

        # Find grid index closest to pour point
        r_idx = int(np.argmin(np.abs(lats_arr - pour_lat)))
        c_idx = int(np.argmin(np.abs(lons_arr - pour_lon)))

        cell_size_x = float(abs(lons_arr[1] - lons_arr[0]) * 105000.0)
        cell_size_y = float(abs(lats_arr[1] - lats_arr[0]) * 111000.0)
        cell_area_m2 = cell_size_x * cell_size_y

        flow_dir = self.compute_d8_flow_direction(grid, cell_size_x, cell_size_y)
        acc_grid = self.compute_flow_accumulation(flow_dir)

        # Snap pour point to local stream channel if needed (highest local accumulation within 3x3)
        win_r = max(0, r_idx - 2), min(rows, r_idx + 3)
        win_c = max(0, c_idx - 2), min(cols, c_idx + 3)
        local_acc = acc_grid[win_r[0]:win_r[1], win_c[0]:win_c[1]]
        local_max = np.unravel_index(np.argmax(local_acc), local_acc.shape)
        snap_r = win_r[0] + local_max[0]
        snap_c = win_c[0] + local_max[1]

        # BFS / Queue to find all upstream cells that flow into snap point
        catchment_mask = np.zeros((rows, cols), dtype=bool)
        catchment_mask[snap_r, snap_c] = True
        queue = [(snap_r, snap_c)]

        # Reverse D8 routing lookup
        while queue:
            cr, cc = queue.pop(0)
            for dr, dc, code in self.D8_OFFSETS:
                nr, nc = cr - dr, cc - dc # Check neighbor that would flow into (cr, cc)
                if 0 <= nr < rows and 0 <= nc < cols and not catchment_mask[nr, nc]:
                    if flow_dir[nr, nc] == code:
                        catchment_mask[nr, nc] = True
                        queue.append((nr, nc))

        # If catchment is too small (e.g. at a ridge), expand naturally using topographic slope basin
        if np.sum(catchment_mask) < 9:
            # Expand to surrounding elevation basin
            pour_elev = grid[snap_r, snap_c]
            for r in range(rows):
                for c in range(cols):
                    dist_km = math.sqrt(((lats_arr[r] - pour_lat)*111)**2 + ((lons_arr[c] - pour_lon)*105)**2)
                    if dist_km < 0.6 and grid[r, c] >= pour_elev - 0.5:
                        catchment_mask[r, c] = True

        # Extract boundary polygon coordinates of the catchment
        polygon_coords = self._mask_to_smoothed_polygon(catchment_mask, lats_arr, lons_arr)

        num_cells = int(np.sum(catchment_mask))
        catchment_area_m2 = round(float(num_cells * cell_area_m2), 1)
        catchment_area_ha = round(catchment_area_m2 / 10000.0, 2)
        catchment_area_km2 = round(catchment_area_m2 / 1000000.0, 3)

        # Average slope across catchment
        gy, gx = np.gradient(grid, cell_size_y, cell_size_x)
        slope_grid = np.sqrt(gx**2 + gy**2) * 100.0
        avg_catchment_slope = round(float(np.mean(slope_grid[catchment_mask])), 2)

        # Main stream drainage flow paths inside catchment
        stream_lines = self._extract_stream_network(catchment_mask, acc_grid, lats_arr, lons_arr, snap_r, snap_c)

        return {
            "type": "Feature",
            "properties": {
                "name": "Delineated Catchment Basin",
                "pour_point": {
                    "lat": round(float(lats_arr[snap_r]), 6),
                    "lon": round(float(lons_arr[snap_c]), 6),
                    "elevation_m": round(float(grid[snap_r, snap_c]), 1)
                },
                "area_sq_meters": catchment_area_m2,
                "area_hectares": catchment_area_ha,
                "area_km2": catchment_area_km2,
                "avg_slope_percent": avg_catchment_slope,
                "flow_accumulation_cells": int(acc_grid[snap_r, snap_c]),
                "drainage_efficiency": "High Natural Inflow Basin" if avg_catchment_slope > 2.0 else "Gentle Inflow Plain"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [polygon_coords]
            },
            "stream_network": {
                "type": "FeatureCollection",
                "features": stream_lines
            }
        }

    def _mask_to_smoothed_polygon(
        self,
        mask: np.ndarray,
        lats: np.ndarray,
        lons: np.ndarray
    ) -> List[List[float]]:
        """Converts a binary catchment mask into an ordered, smoothed polygon coordinate ring [lon, lat]."""
        rows, cols = mask.shape
        boundary_pts = []

        # Collect outer boundary points
        for r in range(rows):
            for c in range(cols):
                if mask[r, c]:
                    # Check 4-neighbor boundary
                    is_edge = False
                    for dr, dc in [(-1,0), (1,0), (0,-1), (0,1)]:
                        nr, nc = r + dr, c + dc
                        if nr < 0 or nr >= rows or nc < 0 or nc >= cols or not mask[nr, nc]:
                            is_edge = True
                            break
                    if is_edge:
                        boundary_pts.append((float(lons[c]), float(lats[r])))

        if not boundary_pts:
            return [[float(lons[0]), float(lats[0])]]

        # Sort boundary points angularly around centroid to form a closed convex/concave hull ring
        center_lon = sum(p[0] for p in boundary_pts) / len(boundary_pts)
        center_lat = sum(p[1] for p in boundary_pts) / len(boundary_pts)

        def angle_from_center(pt):
            return math.atan2(pt[1] - center_lat, pt[0] - center_lon)

        sorted_pts = sorted(boundary_pts, key=angle_from_center)

        # Subsample to keep geometry clean (max 32 points)
        step = max(1, len(sorted_pts) // 28)
        polygon = [list(pt) for pt in sorted_pts[::step]]
        
        # Close the loop
        if polygon and polygon[0] != polygon[-1]:
            polygon.append(polygon[0])

        return polygon

    def _extract_stream_network(
        self,
        mask: np.ndarray,
        acc_grid: np.ndarray,
        lats: np.ndarray,
        lons: np.ndarray,
        pour_r: int,
        pour_c: int
    ) -> List[Dict[str, Any]]:
        """Extracts primary tributary stream vectors inside the catchment."""
        features = []
        rows, cols = mask.shape
        threshold = max(5.0, np.percentile(acc_grid[mask], 70))

        stream_pts = []
        for r in range(rows):
            for c in range(cols):
                if mask[r, c] and acc_grid[r, c] >= threshold:
                    stream_pts.append([round(float(lons[c]), 6), round(float(lats[r]), 6)])

        if len(stream_pts) >= 2:
            # Sort stream points from high to low elevation towards pour point
            pour_pt = [round(float(lons[pour_c]), 6), round(float(lats[pour_r]), 6)]
            stream_pts.sort(key=lambda pt: (pt[0]-pour_pt[0])**2 + (pt[1]-pour_pt[1])**2, reverse=True)
            stream_pts.append(pour_pt)

            features.append({
                "type": "Feature",
                "properties": {
                    "type": "Primary Drainage Stream",
                    "color": "#38bdf8",
                    "weight": 2.5
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": stream_pts
                }
            })

        return features

hydrology_service = HydrologyService()

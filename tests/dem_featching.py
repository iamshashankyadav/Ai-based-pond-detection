"""
iit_bhilai_dem.py
------------------
Fetches a REAL elevation raster (SRTM 30m via OpenTopography) around
IIT Bhilai and generates contour GeoJSON + a preview PNG.

Run locally (this can't be executed from the sandbox that produced it —
opentopography.org isn't reachable from there):

    pip install httpx numpy rasterio pillow scipy matplotlib
    python iit_bhilai_dem.py

Outputs:
    iit_bhilai_contours.geojson
    iit_bhilai_preview.png
"""

import io
import json
import math
from typing import Any, Dict, Tuple

import httpx
import numpy as np

# --- Your key (rotate this if you ever commit/share this file publicly) ---
OPENTOPOGRAPHY_API_KEY = "................"

# IIT Bhilai
CENTER_LAT = 21.2446004
CENTER_LON = 81.3182306
RADIUS_KM = 2.0          # half-width -> ~4km x 4km bbox total
DATASET = "SRTMGL1"      # 30m global SRTM. Try "COP30" for Copernicus 30m as a cross-check.
CONTOUR_INTERVAL_M = 2.5


def bbox_from_center(center_lat: float, center_lon: float, radius_km: float) -> Tuple[float, float, float, float]:
    """Returns (min_lat, min_lon, max_lat, max_lon) for a square-ish box of
    +/- radius_km around a center point."""
    dlat = radius_km / 111.0
    dlon = radius_km / (111.320 * math.cos(math.radians(center_lat)))
    return (center_lat - dlat, center_lon - dlon, center_lat + dlat, center_lon + dlon)


def fetch_opentopography(
    min_lat: float, min_lon: float, max_lat: float, max_lon: float,
    api_key: str, dataset: str = "SRTMGL1",
) -> Dict[str, Any]:
    import rasterio
    from rasterio.io import MemoryFile

    url = "https://portal.opentopography.org/API/globaldem"
    params = {
        "demtype": dataset,
        "south": min_lat, "north": max_lat,
        "west": min_lon, "east": max_lon,
        "outputFormat": "GTiff",
        "API_Key": api_key,
    }
    resp = httpx.get(url, params=params, timeout=30.0)
    resp.raise_for_status()
    if resp.headers.get("content-type", "").startswith("application/json"):
        raise RuntimeError(f"OpenTopography error: {resp.text[:300]}")

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

    # Flip so row 0 = south, matching a standard np.linspace(min_lat, max_lat) grid
    elev = np.flipud(elev)
    lats = lats[::-1]

    if np.isnan(elev).any():
        from scipy import ndimage
        mask = np.isnan(elev)
        idx = ndimage.distance_transform_edt(mask, return_distances=False, return_indices=True)
        elev = elev[tuple(idx)]

    return grid_to_result(lats, lons, elev)


def grid_to_result(lats: np.ndarray, lons: np.ndarray, elev_grid: np.ndarray) -> Dict[str, Any]:
    dx = abs(lons[1] - lons[0]) * 105000.0 if len(lons) > 1 else 30.0
    dy = abs(lats[1] - lats[0]) * 111000.0 if len(lats) > 1 else 30.0
    gy, gx = np.gradient(elev_grid, dy, dx)
    slope_grid = np.sqrt(gx ** 2 + gy ** 2) * 100.0

    return {
        "lats": lats.tolist(),
        "lons": lons.tolist(),
        "elevation_grid": np.round(elev_grid, 2).tolist(),
        "slope_grid": np.round(slope_grid, 2).tolist(),
        "stats": {
            "min_elevation_m": round(float(np.nanmin(elev_grid)), 2),
            "max_elevation_m": round(float(np.nanmax(elev_grid)), 2),
            "mean_elevation_m": round(float(np.nanmean(elev_grid)), 2),
            "relief_m": round(float(np.nanmax(elev_grid) - np.nanmin(elev_grid)), 2),
            "avg_slope_percent": round(float(np.nanmean(slope_grid)), 2),
            "grid_resolution_m": round(float(dx), 1),
            "grid_shape": list(elev_grid.shape),
        },
    }


def generate_contours(lats, lons, elev_grid, contour_interval: float = 2.5) -> Dict[str, Any]:
    grid = np.array(elev_grid)
    lats_arr = np.array(lats)
    lons_arr = np.array(lons)

    min_elev = math.floor(np.nanmin(grid) / contour_interval) * contour_interval
    max_elev = math.ceil(np.nanmax(grid) / contour_interval) * contour_interval
    levels = np.arange(min_elev, max_elev + contour_interval, contour_interval)
    features = []
    rows, cols = grid.shape

    for level in levels:
        segments = []
        for r in range(rows - 1):
            for c in range(cols - 1):
                v0, v1, v2, v3 = grid[r, c], grid[r, c + 1], grid[r + 1, c + 1], grid[r + 1, c]
                if np.isnan([v0, v1, v2, v3]).any():
                    continue
                b0, b1, b2, b3 = int(v0 >= level), int(v1 >= level), int(v2 >= level), int(v3 >= level)
                case = (b0 << 3) | (b1 << 2) | (b2 << 1) | b3
                if case in (0, 15):
                    continue

                def top_pt():
                    t = max(0.0, min(1.0, (level - v0) / (v1 - v0 + 1e-7)))
                    return [round(float(lons_arr[c] + t * (lons_arr[c + 1] - lons_arr[c])), 6), round(float(lats_arr[r]), 6)]

                def right_pt():
                    t = max(0.0, min(1.0, (level - v1) / (v2 - v1 + 1e-7)))
                    return [round(float(lons_arr[c + 1]), 6), round(float(lats_arr[r] + t * (lats_arr[r + 1] - lats_arr[r])), 6)]

                def bottom_pt():
                    t = max(0.0, min(1.0, (level - v3) / (v2 - v3 + 1e-7)))
                    return [round(float(lons_arr[c] + t * (lons_arr[c + 1] - lons_arr[c])), 6), round(float(lats_arr[r + 1]), 6)]

                def left_pt():
                    t = max(0.0, min(1.0, (level - v0) / (v3 - v0 + 1e-7)))
                    return [round(float(lons_arr[c]), 6), round(float(lats_arr[r] + t * (lats_arr[r + 1] - lats_arr[r])), 6)]

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
            features.append({
                "type": "Feature",
                "properties": {"elevation_m": round(float(level), 1)},
                "geometry": {"type": "MultiLineString", "coordinates": segments},
            })

    return {"type": "FeatureCollection",
            "properties": {"contour_interval_m": contour_interval, "levels_count": len(levels)},
            "features": features}


def main():
    min_lat, min_lon, max_lat, max_lon = bbox_from_center(CENTER_LAT, CENTER_LON, RADIUS_KM)
    print(f"bbox: south={min_lat:.5f} west={min_lon:.5f} north={max_lat:.5f} east={max_lon:.5f}")

    print(f"Fetching {DATASET} raster from OpenTopography...")
    result = fetch_opentopography(min_lat, min_lon, max_lat, max_lon, OPENTOPOGRAPHY_API_KEY, DATASET)
    print("Stats:", result["stats"])

    contours = generate_contours(result["lats"], result["lons"], result["elevation_grid"], CONTOUR_INTERVAL_M)
    print(f"Generated {len(contours['features'])} contour lines")

    with open("iit_bhilai_contours.geojson", "w") as f:
        json.dump(contours, f)
    print("Wrote iit_bhilai_contours.geojson")

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        elev = np.array(result["elevation_grid"])
        fig, ax = plt.subplots(figsize=(8, 7))
        im = ax.imshow(elev, cmap="terrain", origin="lower",
                        extent=[result["lons"][0], result["lons"][-1], result["lats"][0], result["lats"][-1]])
        for feat in contours["features"]:
            for seg in feat["geometry"]["coordinates"]:
                xs, ys = zip(*seg)
                ax.plot(xs, ys, color="black", linewidth=0.4, alpha=0.6)
        ax.plot(CENTER_LON, CENTER_LAT, "r*", markersize=15, label="IIT Bhilai")
        ax.legend()
        plt.colorbar(im, ax=ax, label="Elevation (m)")
        ax.set_title(f"IIT Bhilai — {DATASET} — {result['stats']['grid_shape']} grid, "
                     f"{result['stats']['relief_m']}m relief")
        fig.savefig("iit_bhilai_preview.png", dpi=150, bbox_inches="tight")
        print("Wrote iit_bhilai_preview.png — open this first")
    except ImportError:
        print("(install matplotlib for a visual preview)")


if __name__ == "__main__":
    main()
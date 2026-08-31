import os
import uvicorn
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

from services.elevation_service import elevation_service
from services.hydrology_service import hydrology_service
from services.rainfall_service import rainfall_service
from services.runoff_pond_service import runoff_pond_service
from services.kml_service import kml_contour_service

app = FastAPI(
    title="AI Village Pond Detection & Hydrology Siting API",
    description="FastAPI Backend for KML/KMZ Contour Analysis, DEM elevation generation, D8 catchment delineation, Open-Meteo rainfall, runoff modeling, and pond sizing recommendations.",
    version="1.1.0"
)

# Enable CORS for frontend Vite development server and all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Request & Response Models ---
class BBoxRequest(BaseModel):
    bbox: List[float] = Field(..., description="[min_lat, min_lon, max_lat, max_lon]")
    contour_interval: Optional[float] = Field(2.5, description="Contour interval in meters")
    grid_size: Optional[int] = Field(50, description="Grid resolution size (50x50)")

class CatchmentRequest(BaseModel):
    lat: float = Field(..., description="Candidate pond pour point latitude")
    lon: float = Field(..., description="Candidate pond pour point longitude")
    bbox: Optional[List[float]] = Field(None, description="Optional bounding box [min_lat, min_lon, max_lat, max_lon]")

class RunoffRequest(BaseModel):
    catchment_area_m2: float
    annual_rainfall_mm: float
    land_use: Optional[str] = "cultivated_clay_loam"
    custom_c: Optional[float] = None

class PondRecommendationRequest(BaseModel):
    annual_runoff_m3: float
    catchment_area_m2: float
    slope_percent: Optional[float] = 2.5
    target_capture_pct: Optional[float] = 25.0

class FullAnalysisRequest(BaseModel):
    lat: float = Field(..., description="Pour point / candidate pond latitude")
    lon: float = Field(..., description="Pour point / candidate pond longitude")
    bbox: Optional[List[float]] = Field(None, description="Bounding box [min_lat, min_lon, max_lat, max_lon]")
    land_use: Optional[str] = "cultivated_clay_loam"
    custom_c: Optional[float] = None
    target_capture_pct: Optional[float] = 25.0

class KMLFilePathRequest(BaseModel):
    file_path: str = Field(..., description="Absolute or relative path to the KML or KMZ file on disk")
    pour_lat: Optional[float] = Field(None, description="Optional custom pond pour point latitude")
    pour_lon: Optional[float] = Field(None, description="Optional custom pond pour point longitude")
    target_capture_pct: Optional[float] = Field(25.0, description="Target runoff capture percentage")


# --- Endpoints ---

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "AI Village Pond Detection & Hydrology GIS Engine",
        "region_focus": "Bhilai / Chhattisgarh Basin (21.2092° N, 81.4285° E)",
        "features": [
            "KML / KMZ Contour Map Analysis & DEM Rasterization",
            "D8 Catchment Basin Delineation",
            "Open-Meteo Historical Weather Integration",
            "Frustum Pond Sizing & Community Water Security"
        ],
        "docs_url": "/docs"
    }

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "engine": "FastAPI Hydrology & Elevation Core",
        "d8_algorithm": "active",
        "kml_kmz_parser": "active",
        "open_meteo_client": "active"
    }

# --- KML / KMZ Contour Map Analysis Endpoints ---

@app.post("/api/kml/upload")
async def upload_and_analyze_kml(
    file: UploadFile = File(..., description="Upload .kml or .kmz contour file"),
    pour_lat: Optional[float] = Form(None, description="Optional custom pond pour point latitude"),
    pour_lon: Optional[float] = Form(None, description="Optional custom pond pour point longitude"),
    target_capture_pct: Optional[float] = Form(25.0, description="Target runoff capture percentage")
):
    """
    Accepts a contour map (in KML/KMZ format), extracts all contour vector levels,
    interpolates the DEM elevation raster, delineates the upstream D8 catchment basin,
    fetches live rainfall, and generates pond sizing recommendations.
    """
    filename = file.filename or "contour.kml"
    if not (filename.lower().endswith('.kml') or filename.lower().endswith('.kmz')):
        raise HTTPException(status_code=400, detail="Uploaded file must be a .kml or .kmz contour map.")

    try:
        content = await file.read()
        analysis = await kml_contour_service.analyze_kml_file(
            file_bytes=content,
            filename=filename,
            pour_lat=pour_lat,
            pour_lon=pour_lon,
            target_capture_pct=target_capture_pct or 25.0
        )
        return analysis
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing KML/KMZ contour map: {str(e)}")

@app.post("/api/kml/analyze-file")
async def analyze_kml_file_path(req: KMLFilePathRequest):
    """
    Analyzes an existing KML or KMZ contour map file on disk.
    Example: { "file_path": "d:/projects/Ai-based-pond-detection/contours_1m.kml" }
    """
    normalized_path = os.path.abspath(req.file_path)
    if not os.path.exists(normalized_path):
        raise HTTPException(status_code=404, detail=f"File not found on disk at: {normalized_path}")

    try:
        with open(normalized_path, "rb") as f:
            content = f.read()

        filename = os.path.basename(normalized_path)
        analysis = await kml_contour_service.analyze_kml_file(
            file_bytes=content,
            filename=filename,
            pour_lat=req.pour_lat,
            pour_lon=req.pour_lon,
            target_capture_pct=req.target_capture_pct or 25.0
        )
        return analysis
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing KML contour file: {str(e)}")


# --- Standard Geospatial & Hydrology Endpoints ---

@app.post("/api/elevation/contours")
async def get_elevation_and_contours(req: BBoxRequest):
    """
    Fetches elevation grid, extracts Marching Squares contour GeoJSON lines,
    and identifies natural terrain depression sinks.
    """
    if len(req.bbox) != 4:
        raise HTTPException(status_code=400, detail="bbox must be [min_lat, min_lon, max_lat, max_lon]")

    min_lat, min_lon, max_lat, max_lon = req.bbox
    grid_data = await elevation_service.get_elevation_grid(
        min_lat=min_lat,
        min_lon=min_lon,
        max_lat=max_lat,
        max_lon=max_lon,
        grid_size=req.grid_size or 50
    )

    contours = elevation_service.generate_contours(
        lats=grid_data["lats"],
        lons=grid_data["lons"],
        elev_grid=grid_data["elevation_grid"],
        contour_interval=req.contour_interval or 2.5
    )

    sinks = elevation_service.detect_natural_sinks(
        lats=grid_data["lats"],
        lons=grid_data["lons"],
        elev_grid=grid_data["elevation_grid"],
        slope_grid=grid_data["slope_grid"],
        max_sinks=5
    )

    return {
        "bbox": req.bbox,
        "dem_stats": grid_data["stats"],
        "contours_geojson": contours,
        "detected_sinks": sinks
    }

@app.post("/api/catchment/delineate")
async def delineate_catchment(req: CatchmentRequest):
    """
    Runs D8 flow direction and accumulation algorithm to delineate
    the upstream drainage catchment basin for a candidate pond pour point.
    """
    if req.bbox and len(req.bbox) == 4:
        min_lat, min_lon, max_lat, max_lon = req.bbox
    else:
        min_lat = req.lat - 0.022
        max_lat = req.lat + 0.022
        min_lon = req.lon - 0.022
        max_lon = req.lon + 0.022

    grid_data = await elevation_service.get_elevation_grid(
        min_lat=min_lat,
        min_lon=min_lon,
        max_lat=max_lat,
        max_lon=max_lon,
        grid_size=55
    )

    catchment_geojson = hydrology_service.delineate_catchment(
        pour_lat=req.lat,
        pour_lon=req.lon,
        lats=grid_data["lats"],
        lons=grid_data["lons"],
        elev_grid=grid_data["elevation_grid"]
    )

    return catchment_geojson

@app.get("/api/rainfall/history")
async def get_rainfall_history(
    lat: float = Query(21.2092, description="Latitude"),
    lon: float = Query(81.4285, description="Longitude"),
    years: int = Query(5, description="Number of years history")
):
    """
    Calls Open-Meteo Historical Weather API for rainfall stats and monthly distribution.
    """
    return await rainfall_service.get_historical_rainfall(lat=lat, lon=lon, years=years)

@app.post("/api/runoff/estimate")
def estimate_runoff(req: RunoffRequest):
    """
    Computes annual and monthly runoff volumes using Rational & SCS-CN methods.
    """
    return runoff_pond_service.estimate_runoff(
        catchment_area_m2=req.catchment_area_m2,
        annual_rainfall_mm=req.annual_rainfall_mm,
        land_use=req.land_use or "cultivated_clay_loam",
        custom_c=req.custom_c
    )

@app.post("/api/pond/recommend")
def recommend_pond_dimensions(req: PondRecommendationRequest):
    """
    Calculates optimal 3D frustum pond dimensions, volume, depth, and community water benefits.
    """
    return runoff_pond_service.recommend_pond_sizing(
        annual_runoff_m3=req.annual_runoff_m3,
        catchment_area_m2=req.catchment_area_m2,
        slope_percent=req.slope_percent or 2.5,
        target_capture_pct=req.target_capture_pct or 25.0
    )

@app.post("/api/analyze/full")
async def run_full_analysis(req: FullAnalysisRequest):
    """
    Unified one-click pipeline: Runs DEM Contours + Sinks + D8 Catchment Basin +
    Live Open-Meteo Rainfall + Runoff Estimation + Frustum Sizing recommendations.
    """
    if req.bbox and len(req.bbox) == 4:
        min_lat, min_lon, max_lat, max_lon = req.bbox
    else:
        min_lat = req.lat - 0.022
        max_lat = req.lat + 0.022
        min_lon = req.lon - 0.022
        max_lon = req.lon + 0.022

    # 1. Elevation Grid & Contours
    grid_data = await elevation_service.get_elevation_grid(
        min_lat=min_lat, min_lon=min_lon, max_lat=max_lat, max_lon=max_lon, grid_size=55
    )
    contours_geojson = elevation_service.generate_contours(
        lats=grid_data["lats"], lons=grid_data["lons"],
        elev_grid=grid_data["elevation_grid"], contour_interval=2.5
    )
    sinks = elevation_service.detect_natural_sinks(
        lats=grid_data["lats"], lons=grid_data["lons"],
        elev_grid=grid_data["elevation_grid"], slope_grid=grid_data["slope_grid"], max_sinks=4
    )

    # 2. D8 Catchment Delineation
    catchment_geojson = hydrology_service.delineate_catchment(
        pour_lat=req.lat, pour_lon=req.lon,
        lats=grid_data["lats"], lons=grid_data["lons"],
        elev_grid=grid_data["elevation_grid"]
    )
    catchment_props = catchment_geojson["properties"]
    catchment_area_m2 = catchment_props["area_sq_meters"]
    avg_slope = catchment_props["avg_slope_percent"]

    # 3. Live Rainfall Data
    rainfall_data = await rainfall_service.get_historical_rainfall(lat=req.lat, lon=req.lon, years=5)
    annual_rainfall_mm = rainfall_data["annual_rainfall_mm"]

    # 4. Runoff Volume Estimation
    runoff_data = runoff_pond_service.estimate_runoff(
        catchment_area_m2=catchment_area_m2,
        annual_rainfall_mm=annual_rainfall_mm,
        land_use=req.land_use or "cultivated_clay_loam",
        custom_c=req.custom_c,
        monthly_distribution=rainfall_data.get("monthly_distribution", [])
    )

    # 5. Pond Frustum Dimension Sizing
    pond_recommendations = runoff_pond_service.recommend_pond_sizing(
        annual_runoff_m3=runoff_data["annual_runoff_volume_m3"],
        catchment_area_m2=catchment_area_m2,
        slope_percent=avg_slope,
        target_capture_pct=req.target_capture_pct or 25.0
    )

    return {
        "status": "success",
        "location": {
            "lat": req.lat,
            "lon": req.lon,
            "region": "Bhilai / Chhattisgarh Watershed"
        },
        "elevation": {
            "stats": grid_data["stats"],
            "contours_geojson": contours_geojson,
            "natural_sinks": sinks
        },
        "catchment": catchment_geojson,
        "rainfall": rainfall_data,
        "runoff": runoff_data,
        "pond_recommendation": pond_recommendations
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

import React, { useState } from 'react';
import { 
  Droplets, 
  Mountain, 
  CloudRain, 
  Compass, 
  Sliders, 
  Layers, 
  Sparkles, 
  CheckCircle2, 
  ArrowUpRight,
  TrendingUp,
  Activity,
  Users,
  Shield,
  Maximize2
} from 'lucide-react';
import { formatArea } from '../services/geoUtils';

export default function HydrologyDashboard({
  analysisData,
  loading,
  onRerunAnalysis,
  onFlyToLocation,
  activeHydrologyLayers,
  onToggleHydrologyLayer,
  onUpdateRunoffCoeff,
}) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'catchment' | 'rainfall' | 'pond' | 'sinks'
  const [customC, setCustomC] = useState(0.35);

  if (loading) {
    return (
      <div className="hydrology-loading-card">
        <div className="loading-spinner-wrapper">
          <Droplets size={32} className="text-cyan animate-bounce" />
        </div>
        <h4>Running AI Hydrology Analysis Engine...</h4>
        <p className="loading-sub">
          Generating DEM elevation grid &bull; Running D8 flow routing &bull; Pulling Open-Meteo rainfall &bull; Computing pond frustum sizing
        </p>
      </div>
    );
  }

  if (!analysisData) {
    return (
      <div className="hydrology-empty-card">
        <Mountain size={28} className="text-muted" />
        <h4>No Hydrology Analysis Active</h4>
        <p>
          Select an Area of Interest (BBox / Polygon) or click a Candidate Pond point on the map, then click <strong>"Run AI Hydrology Analysis"</strong>.
        </p>
      </div>
    );
  }

  const { catchment, rainfall, runoff, pond_recommendation, elevation } = analysisData;
  const catchmentProps = catchment?.properties || {};
  const pondStorage = pond_recommendation?.storage_capacity || {};
  const topDim = pond_recommendation?.top_dimensions_m || {};
  const community = pond_recommendation?.community_impact || {};

  const handleSliderChange = (newC) => {
    setCustomC(newC);
    if (onUpdateRunoffCoeff) {
      onUpdateRunoffCoeff(newC);
    }
  };

  return (
    <div className="hydrology-dashboard-panel">
      {/* Dashboard Top Title & Controls */}
      <div className="dash-header-row">
        <div className="dash-title-group">
          <div className="dash-icon-box">
            <Droplets size={18} />
          </div>
          <div>
            <h3>Hydrological Analysis & Pond Siting</h3>
            <span className="dash-sub">
              D8 Watershed Model &bull; Open-Meteo Precipitation &bull; Frustum Geometry
            </span>
          </div>
        </div>
      </div>

      {/* Layer Toggle Quick Bar */}
      <div className="hydro-layers-bar">
        <span className="layers-bar-label">Map Overlays:</span>
        <button
          className={`hydro-layer-pill ${activeHydrologyLayers.contours ? 'active' : ''}`}
          onClick={() => onToggleHydrologyLayer('contours')}
          title="Toggle Elevation Contour Lines"
        >
          <Mountain size={12} />
          <span>Contours</span>
        </button>
        <button
          className={`hydro-layer-pill ${activeHydrologyLayers.catchment ? 'active' : ''}`}
          onClick={() => onToggleHydrologyLayer('catchment')}
          title="Toggle Catchment Watershed Polygon"
        >
          <Compass size={12} />
          <span>Watershed</span>
        </button>
        <button
          className={`hydro-layer-pill ${activeHydrologyLayers.sinks ? 'active' : ''}`}
          onClick={() => onToggleHydrologyLayer('sinks')}
          title="Toggle Natural Depression Sinks"
        >
          <Sparkles size={12} />
          <span>AI Sinks</span>
        </button>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="hydro-tab-strip">
        <button 
          className={`hydro-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`hydro-tab ${activeTab === 'catchment' ? 'active' : ''}`}
          onClick={() => setActiveTab('catchment')}
        >
          Catchment
        </button>
        <button 
          className={`hydro-tab ${activeTab === 'rainfall' ? 'active' : ''}`}
          onClick={() => setActiveTab('rainfall')}
        >
          Rainfall & Runoff
        </button>
        <button 
          className={`hydro-tab ${activeTab === 'pond' ? 'active' : ''}`}
          onClick={() => setActiveTab('pond')}
        >
          Pond Sizing
        </button>
        <button 
          className={`hydro-tab ${activeTab === 'sinks' ? 'active' : ''}`}
          onClick={() => setActiveTab('sinks')}
        >
          AI Sinks ({elevation?.natural_sinks?.length || 0})
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="dash-tab-content">
          <div className="overview-kpis-grid">
            <div className="kpi-card highlight-cyan">
              <span className="kpi-label">Catchment Basin</span>
              <span className="kpi-value">{catchmentProps.area_hectares} ha</span>
              <span className="kpi-sub">{Math.round(catchmentProps.area_sq_meters || 0).toLocaleString()} m² area</span>
            </div>

            <div className="kpi-card highlight-emerald">
              <span className="kpi-label">Annual Runoff Inflow</span>
              <span className="kpi-value">{runoff?.annual_runoff_volume_million_liters} ML</span>
              <span className="kpi-sub">{Math.round(runoff?.annual_runoff_volume_m3 || 0).toLocaleString()} m³/year</span>
            </div>

            <div className="kpi-card">
              <span className="kpi-label">Recommended Depth</span>
              <span className="kpi-value">{pond_recommendation?.recommended_depth_m} m</span>
              <span className="kpi-sub">Frustum slope {pond_recommendation?.side_embankment_slope}</span>
            </div>

            <div className="kpi-card highlight-amber">
              <span className="kpi-label">Pond Storage Capacity</span>
              <span className="kpi-value">{pondStorage?.million_liters} ML</span>
              <span className="kpi-sub">{Math.round(pondStorage?.volume_m3 || 0).toLocaleString()} m³ storage</span>
            </div>
          </div>

          <div className="impact-banner">
            <div className="impact-title-row">
              <Shield size={16} className="text-emerald" />
              <h4>Community Water Security Assessment</h4>
            </div>
            <div className="impact-stats-grid">
              <div className="impact-stat">
                <span className="stat-num">{community?.village_water_supply_days} Days</span>
                <span className="stat-desc">Village Water Supply (1,200 pop)</span>
              </div>
              <div className="impact-stat">
                <span className="stat-num">{community?.livestock_support_days} Days</span>
                <span className="stat-desc">Livestock & Cattle Water (400 cattle)</span>
              </div>
              <div className="impact-stat">
                <span className="stat-num">{community?.supplemental_irrigation_ha} ha</span>
                <span className="stat-desc">Kharif/Rabi Supplemental Irrigation</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Catchment & Watershed */}
      {activeTab === 'catchment' && (
        <div className="dash-tab-content">
          <div className="detail-section-card">
            <h4>D8 Drainage Basin Specifications</h4>
            <div className="specs-list">
              <div className="spec-row">
                <span className="spec-name">Catchment Area:</span>
                <span className="spec-val">{catchmentProps.area_hectares} ha ({catchmentProps.area_km2} km²)</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Average Terrain Slope:</span>
                <span className="spec-val">{catchmentProps.avg_slope_percent}%</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Pour Point Coordinates:</span>
                <span className="spec-val mono">
                  {catchmentProps.pour_point?.lat}°N, {catchmentProps.pour_point?.lon}°E
                </span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Pour Point Elevation:</span>
                <span className="spec-val">{catchmentProps.pour_point?.elevation_m} m AMSL</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Drainage Classification:</span>
                <span className="spec-val highlight">{catchmentProps.drainage_efficiency}</span>
              </div>
            </div>
          </div>

          {elevation?.stats && (
            <div className="detail-section-card">
              <h4>DEM Topography & Relief</h4>
              <div className="specs-list">
                <div className="spec-row">
                  <span className="spec-name">Elevation Range:</span>
                  <span className="spec-val">{elevation.stats.min_elevation_m} m &ndash; {elevation.stats.max_elevation_m} m</span>
                </div>
                <div className="spec-row">
                  <span className="spec-name">Total Relief:</span>
                  <span className="spec-val">{elevation.stats.relief_m} m</span>
                </div>
                <div className="spec-row">
                  <span className="spec-name">Grid Resolution:</span>
                  <span className="spec-val">~{elevation.stats.grid_resolution_m} m SRTM mesh</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Rainfall & Runoff */}
      {activeTab === 'rainfall' && (
        <div className="dash-tab-content">
          <div className="rainfall-summary-box">
            <div className="rainfall-kpi">
              <span className="rf-label">Annual Precipitation</span>
              <span className="rf-val">{rainfall?.annual_rainfall_mm} mm</span>
              <span className="rf-source">{rainfall?.source}</span>
            </div>
            <div className="rainfall-kpi">
              <span className="rf-label">Monsoon Share (Jun&ndash;Sep)</span>
              <span className="rf-val text-emerald">{rainfall?.monsoon_percentage}%</span>
              <span className="rf-source">{rainfall?.monsoon_rainfall_mm} mm monsoon total</span>
            </div>
          </div>

          {/* Monthly Histogram Chart */}
          <div className="monthly-chart-container">
            <h4>Monthly Rainfall Distribution (mm)</h4>
            <div className="bar-chart-wrapper">
              {rainfall?.monthly_distribution?.map((item) => {
                const heightPct = Math.min(100, Math.max(8, (item.rainfall_mm / 400.0) * 100));
                const isMonsoon = ['Jun', 'Jul', 'Aug', 'Sep'].includes(item.month);
                return (
                  <div key={item.month} className="bar-column">
                    <span className="bar-val">{Math.round(item.rainfall_mm)}</span>
                    <div 
                      className={`chart-bar ${isMonsoon ? 'monsoon' : ''}`}
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className="bar-label">{item.month}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Interactive Runoff Coefficient Slider */}
          <div className="runoff-slider-card">
            <div className="slider-header">
              <div className="slider-label-group">
                <Sliders size={14} className="text-cyan" />
                <h4>Soil & Land-Use Runoff Coefficient (C)</h4>
              </div>
              <span className="slider-value-pill">C = {customC.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.15"
              max="0.75"
              step="0.05"
              value={customC}
              onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
              className="c-slider"
            />
            <div className="slider-benchmarks">
              <span>0.15 (Sandy/Forest)</span>
              <span>0.35 (Cultivated/Clay)</span>
              <span>0.65 (Rocky/Hilly)</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Pond Sizing & Engineering Specs */}
      {activeTab === 'pond' && (
        <div className="dash-tab-content">
          <div className="detail-section-card">
            <h4>3D Frustum Geometry & Dimensions</h4>
            <div className="specs-list">
              <div className="spec-row">
                <span className="spec-name">Recommended Water Depth (h):</span>
                <span className="spec-val highlight">{pond_recommendation?.recommended_depth_m} meters</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Top Water Surface Area:</span>
                <span className="spec-val">{topDim?.surface_area_m2} m² ({topDim?.surface_area_ha} ha)</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Top Dimensions (L × W):</span>
                <span className="spec-val">{topDim?.length}m × {topDim?.width}m</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Bottom Bed Dimensions:</span>
                <span className="spec-val">{pond_recommendation?.bottom_dimensions_m?.length}m × {pond_recommendation?.bottom_dimensions_m?.width}m</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Embankment Side Slope:</span>
                <span className="spec-val">{pond_recommendation?.side_embankment_slope}</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Total Storage Capacity:</span>
                <span className="spec-val highlight text-emerald">
                  {pondStorage?.volume_m3} m³ ({pondStorage?.million_liters} Million Liters)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: AI Natural Depression Sinks */}
      {activeTab === 'sinks' && (
        <div className="dash-tab-content">
          <p className="tab-desc">
            Natural depressions with low slope (&lt;5%) and high flow accumulation identified as optimal candidate pond sites:
          </p>
          <div className="sinks-list">
            {elevation?.natural_sinks?.map((sink, idx) => (
              <div key={sink.id} className="sink-card">
                <div className="sink-card-header">
                  <div className="sink-rank">#{idx + 1} SINK</div>
                  <span className="sink-score">Score: {sink.suitability_score}%</span>
                </div>
                <div className="sink-metrics">
                  <span>Elev: {sink.elevation_m}m</span>
                  <span>Slope: {sink.slope_percent}%</span>
                  <span>Depth: {sink.depression_depth_m}m</span>
                </div>
                <button 
                  className="sink-fly-btn"
                  onClick={() => onFlyToLocation(sink.lat, sink.lon, 16, `Sink #${idx + 1}`)}
                >
                  <ArrowUpRight size={13} />
                  <span>Inspect & Center on Sink</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import React from 'react';
import { 
  Square, 
  Hexagon, 
  MapPin, 
  Hand, 
  Trash2, 
  Eye, 
  Download, 
  Send, 
  HelpCircle,
  Crosshair,
  Maximize
} from 'lucide-react';
import { formatArea } from '../services/geoUtils';

export default function AreaSelectorToolbar({
  activeDrawMode,
  onChangeDrawMode,
  activeSelection,
  onClearSelection,
  onOpenPayloadModal,
  onFitSelection,
  isDrawing
}) {
  const formattedArea = activeSelection?.areaSqMeters
    ? formatArea(activeSelection.areaSqMeters)
    : null;

  return (
    <div className="area-selector-panel">
      <div className="section-header">
        <Square size={16} className="section-icon" />
        <h3>Area of Interest (AOI) Selector</h3>
      </div>

      <p className="section-desc">
        Select region boundaries to extract DEM elevation contours, delineate catchment watersheds, or position candidate village ponds.
      </p>

      {/* Draw Tools Selector */}
      <div className="draw-tools-grid">
        <button
          className={`draw-tool-card ${activeDrawMode === 'bbox' ? 'active' : ''}`}
          onClick={() => onChangeDrawMode(activeDrawMode === 'bbox' ? 'pan' : 'bbox')}
        >
          <div className="tool-icon">
            <Square size={20} />
          </div>
          <div className="tool-content">
            <span className="tool-title">Bounding Box (BBox)</span>
            <span className="tool-desc">Click & drag rectangle over village region</span>
          </div>
          {activeDrawMode === 'bbox' && <span className="active-indicator" />}
        </button>

        <button
          className={`draw-tool-card ${activeDrawMode === 'polygon' ? 'active' : ''}`}
          onClick={() => onChangeDrawMode(activeDrawMode === 'polygon' ? 'pan' : 'polygon')}
        >
          <div className="tool-icon">
            <Hexagon size={20} />
          </div>
          <div className="tool-content">
            <span className="tool-title">Freehand Polygon</span>
            <span className="tool-desc">Click vertices along natural contour/boundary</span>
          </div>
          {activeDrawMode === 'polygon' && <span className="active-indicator" />}
        </button>

        <button
          className={`draw-tool-card ${activeDrawMode === 'point' ? 'active' : ''}`}
          onClick={() => onChangeDrawMode(activeDrawMode === 'point' ? 'pan' : 'point')}
        >
          <div className="tool-icon">
            <MapPin size={20} />
          </div>
          <div className="tool-content">
            <span className="tool-title">Candidate Pond Point</span>
            <span className="tool-desc">Click on map to place pour point / sink</span>
          </div>
          {activeDrawMode === 'point' && <span className="active-indicator" />}
        </button>

        <button
          className={`draw-tool-card ${activeDrawMode === 'pan' ? 'active' : ''}`}
          onClick={() => onChangeDrawMode('pan')}
        >
          <div className="tool-icon">
            <Hand size={20} />
          </div>
          <div className="tool-content">
            <span className="tool-title">Navigate & Pan Map</span>
            <span className="tool-desc">Standard pan and zoom without drawing</span>
          </div>
          {activeDrawMode === 'pan' && <span className="active-indicator" />}
        </button>
      </div>

      {/* Drawing Instructions Banner */}
      {activeDrawMode !== 'pan' && (
        <div className="draw-instructions-banner">
          <div className="banner-top">
            <Crosshair size={14} className="banner-icon animate-pulse" />
            <span className="banner-title">
              {activeDrawMode === 'bbox' && 'Bounding Box Mode Active'}
              {activeDrawMode === 'polygon' && 'Polygon Drawing Mode Active'}
              {activeDrawMode === 'point' && 'Pond Pour Point Mode Active'}
            </span>
          </div>
          <p className="banner-text">
            {activeDrawMode === 'bbox' && 'Click and drag on the satellite map to define the bounding box.'}
            {activeDrawMode === 'polygon' && 'Click on map to add boundary points. Double click or click the first point to finish.'}
            {activeDrawMode === 'point' && 'Click anywhere on the map to set candidate pond location.'}
          </p>
        </div>
      )}

      {/* Active Selection Summary Card */}
      {activeSelection ? (
        <div className="selection-summary-card">
          <div className="summary-header">
            <div className="summary-title-group">
              <span className="summary-badge">{activeSelection.type.toUpperCase()}</span>
              <h4>{activeSelection.name || 'Selected Region'}</h4>
            </div>
            <div className="summary-actions">
              <button 
                className="icon-action-btn"
                onClick={onFitSelection}
                title="Fit map view to this selection"
              >
                <Maximize size={14} />
              </button>
              <button 
                className="icon-action-btn danger"
                onClick={onClearSelection}
                title="Clear selection"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <div className="summary-metrics-grid">
            {formattedArea && (
              <div className="metric-box">
                <span className="metric-label">Calculated Area</span>
                <span className="metric-value primary">{formattedArea.primary}</span>
                <span className="metric-sub">{formattedArea.acres}</span>
              </div>
            )}
            
            {activeSelection.perimeterMeters && (
              <div className="metric-box">
                <span className="metric-label">Perimeter</span>
                <span className="metric-value">
                  {(activeSelection.perimeterMeters / 1000).toFixed(2)} km
                </span>
                <span className="metric-sub">
                  {Math.round(activeSelection.perimeterMeters).toLocaleString()} m
                </span>
              </div>
            )}

            <div className="metric-box">
              <span className="metric-label">Center Coordinate</span>
              <span className="metric-value">
                {activeSelection.center 
                  ? `${activeSelection.center.lat.toFixed(4)}°, ${activeSelection.center.lng.toFixed(4)}°`
                  : 'N/A'}
              </span>
              <span className="metric-sub">Centroid</span>
            </div>
          </div>

          <button 
            className="payload-trigger-btn"
            onClick={onOpenPayloadModal}
          >
            <Send size={15} />
            <span>Inspect Backend Payload & Export GeoJSON</span>
          </button>
        </div>
      ) : (
        <div className="empty-selection-placeholder">
          <HelpCircle size={24} className="placeholder-icon" />
          <span>No region selected yet. Choose a drawing tool above to select an area.</span>
        </div>
      )}
    </div>
  );
}

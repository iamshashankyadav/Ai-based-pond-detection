import React from 'react';
import { 
  Layers, 
  Compass, 
  RotateCcw, 
  Maximize2, 
  Minimize2, 
  FileCode2, 
  MapPin,
  Sparkles,
  Info
} from 'lucide-react';
import { toDMS } from '../services/geoUtils';

export default function Header({
  mapCenter,
  currentLocationName,
  onResetView,
  onOpenPayloadModal,
  onToggleSidebar,
  sidebarOpen,
  activeSelection,
  isFullscreen,
  onToggleFullscreen
}) {
  return (
    <header className="gis-header">
      <div className="header-left">
        <button 
          className={`sidebar-toggle-btn ${sidebarOpen ? 'active' : ''}`}
          onClick={onToggleSidebar}
          title="Toggle Control Panel"
          aria-label="Toggle Control Panel"
        >
          <Layers size={18} />
          <span>GIS Controls</span>
        </button>

        <div className="brand-group">
          <div className="brand-logo">
            <Sparkles size={18} className="brand-icon" />
          </div>
          <div className="brand-titles">
            <h1 className="brand-name">AI Pond Locator & GIS Siting</h1>
            <span className="brand-subtitle">High-Resolution Satellite Hydrology Engine</span>
          </div>
        </div>
      </div>

      <div className="header-center">
        <div className="location-badge">
          <MapPin size={14} className="location-pin" />
          <span className="location-text">{currentLocationName || 'Bhilai, Chhattisgarh'}</span>
          <span className="coords-text">
            {mapCenter ? `${mapCenter.lat.toFixed(4)}°N, ${mapCenter.lng.toFixed(4)}°E` : '21.2092°N, 81.4285°E'}
          </span>
        </div>
      </div>

      <div className="header-right">
        {activeSelection && (
          <button 
            className="header-btn highlight-btn"
            onClick={onOpenPayloadModal}
            title="Inspect GeoJSON and Backend Payload"
          >
            <FileCode2 size={16} />
            <span>View Payload</span>
            <span className="badge-pill">{activeSelection.type.toUpperCase()}</span>
          </button>
        )}

        <button 
          className="header-btn" 
          onClick={onResetView}
          title="Reset to default Bhilai coordinates (21.2092° N, 81.4285° E)"
        >
          <RotateCcw size={16} />
          <span>Reset to Bhilai</span>
        </button>

        <button 
          className="header-btn icon-only"
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
    </header>
  );
}

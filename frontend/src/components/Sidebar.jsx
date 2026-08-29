import React from 'react';
import { 
  Search, 
  Layers, 
  Square, 
  ChevronLeft, 
  ChevronRight 
} from 'lucide-react';
import LocationSearch from './LocationSearch';
import LayerControl from './LayerControl';
import AreaSelectorToolbar from './AreaSelectorToolbar';

export default function Sidebar({
  isOpen,
  onToggle,
  activeTab,
  onChangeTab,
  onSelectLocation,
  onFlyToCoordinates,
  activeBaseLayerId,
  onSelectBaseLayer,
  activeOverlays,
  onToggleOverlay,
  layerOpacity,
  onChangeOpacity,
  activeDrawMode,
  onChangeDrawMode,
  activeSelection,
  onClearSelection,
  onOpenPayloadModal,
  onFitSelection,
  onSelectPresetAOI,
}) {
  return (
    <aside className={`gis-sidebar ${isOpen ? 'open' : 'closed'}`}>
      {/* Sidebar Navigation Tabs */}
      <div className="sidebar-tab-strip">
        <button
          className={`tab-strip-btn ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => onChangeTab('search')}
          title="Search Villages & Presets"
        >
          <Search size={18} />
          <span>Search</span>
        </button>

        <button
          className={`tab-strip-btn ${activeTab === 'layers' ? 'active' : ''}`}
          onClick={() => onChangeTab('layers')}
          title="Imagery & Map Layers"
        >
          <Layers size={18} />
          <span>Layers</span>
        </button>

        <button
          className={`tab-strip-btn ${activeTab === 'draw' ? 'active' : ''}`}
          onClick={() => onChangeTab('draw')}
          title="Area Selector & Tools"
        >
          <Square size={18} />
          <span>Area AOI</span>
        </button>

        <div className="tab-strip-spacer" />

        <button
          className="tab-strip-btn collapse-toggle"
          onClick={onToggle}
          title={isOpen ? 'Collapse panel' : 'Expand panel'}
        >
          {isOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      {/* Sidebar Content Panel */}
      {isOpen && (
        <div className="sidebar-content-body">
          {activeTab === 'search' && (
            <LocationSearch
              onSelectLocation={onSelectLocation}
              onFlyToCoordinates={onFlyToCoordinates}
            />
          )}

          {activeTab === 'layers' && (
            <LayerControl
              activeBaseLayerId={activeBaseLayerId}
              onSelectBaseLayer={onSelectBaseLayer}
              activeOverlays={activeOverlays}
              onToggleOverlay={onToggleOverlay}
              layerOpacity={layerOpacity}
              onChangeOpacity={onChangeOpacity}
            />
          )}

          {activeTab === 'draw' && (
            <AreaSelectorToolbar
              activeDrawMode={activeDrawMode}
              onChangeDrawMode={onChangeDrawMode}
              activeSelection={activeSelection}
              onClearSelection={onClearSelection}
              onOpenPayloadModal={onOpenPayloadModal}
              onFitSelection={onFitSelection}
              onSelectPresetAOI={onSelectPresetAOI}
            />
          )}
        </div>
      )}
    </aside>
  );
}

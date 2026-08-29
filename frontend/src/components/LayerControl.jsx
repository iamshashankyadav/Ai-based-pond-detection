import React from 'react';
import { Layers, Eye, Sliders, ShieldCheck, Mountain, Satellite, Map as MapIcon, Moon } from 'lucide-react';

export const BASE_LAYERS = [
  {
    id: 'esri-imagery',
    name: 'Esri World Imagery',
    tag: 'Default Satellite',
    icon: Satellite,
    description: 'High-resolution global satellite and aerial imagery from Maxar, Earthstar, and GeoEye.',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19,
  },
  {
    id: 'esri-topo',
    name: 'Esri World Topo',
    tag: 'Topographic',
    icon: Mountain,
    description: 'Contour relief, water bodies, elevation contours, and rural landmarks.',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community',
    maxZoom: 19,
  },
  {
    id: 'opentopo',
    name: 'OpenTopoMap',
    tag: 'Elevation & Contours',
    icon: Mountain,
    description: 'High-contrast topographic rendering with 10m/20m contour lines.',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)',
    maxZoom: 17,
  },
  {
    id: 'osm-standard',
    name: 'OpenStreetMap',
    tag: 'Street & Village Bounds',
    icon: MapIcon,
    description: 'Community-driven vector cartography with village labels and local roads.',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  {
    id: 'carto-dark',
    name: 'CartoDB Dark Matter',
    tag: 'Night / Contrast GIS',
    icon: Moon,
    description: 'Sleek dark theme highlighting hydrological vector overlays and catchments.',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  },
];

export const OVERLAYS = [
  {
    id: 'esri-places',
    name: 'Village Names & Boundaries',
    description: 'Esri reference labels overlay over satellite imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    defaultActive: true,
  },
  {
    id: 'esri-transport',
    name: 'Roads & Canals Network',
    description: 'Esri transportation network overlay',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    defaultActive: false,
  }
];

export default function LayerControl({
  activeBaseLayerId,
  onSelectBaseLayer,
  activeOverlays,
  onToggleOverlay,
  layerOpacity,
  onChangeOpacity,
}) {
  return (
    <div className="layer-control-panel">
      <div className="section-header">
        <Layers size={16} className="section-icon" />
        <h3>Base Imagery & Map Layers</h3>
      </div>
      
      <p className="section-desc">
        Select base cartography for terrain, contour evaluation, and satellite inspection.
      </p>

      {/* Base Layer Tiles */}
      <div className="base-layers-grid">
        {BASE_LAYERS.map((layer) => {
          const Icon = layer.icon;
          const isSelected = activeBaseLayerId === layer.id;

          return (
            <div
              key={layer.id}
              className={`layer-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectBaseLayer(layer.id)}
            >
              <div className="layer-card-top">
                <div className="layer-icon-box">
                  <Icon size={18} />
                </div>
                <div className="layer-info">
                  <div className="layer-name-row">
                    <span className="layer-name">{layer.name}</span>
                    {layer.id === 'esri-imagery' && (
                      <span className="default-pill">Default</span>
                    )}
                  </div>
                  <span className="layer-tag">{layer.tag}</span>
                </div>
              </div>
              <p className="layer-desc">{layer.description}</p>
            </div>
          );
        })}
      </div>

      {/* Overlays Section */}
      <div className="overlay-section">
        <div className="subsection-title">
          <Eye size={14} />
          <h4>Reference Overlays</h4>
        </div>

        <div className="overlays-list">
          {OVERLAYS.map((overlay) => {
            const isActive = activeOverlays.includes(overlay.id);
            return (
              <label key={overlay.id} className="overlay-item">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={() => onToggleOverlay(overlay.id)}
                />
                <div className="overlay-text">
                  <span className="overlay-name">{overlay.name}</span>
                  <span className="overlay-sub">{overlay.description}</span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Opacity Control */}
      <div className="opacity-section">
        <div className="subsection-title">
          <Sliders size={14} />
          <h4>Imagery Opacity</h4>
          <span className="opacity-value">{Math.round(layerOpacity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.2"
          max="1.0"
          step="0.05"
          value={layerOpacity}
          onChange={(e) => onChangeOpacity(parseFloat(e.target.value))}
          className="opacity-slider"
        />
      </div>
    </div>
  );
}

import React, { useState, useRef, useCallback } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MapEngine from './components/MapEngine';
import CoordinateHUD from './components/CoordinateHUD';
import SelectionDetailsModal from './components/SelectionDetailsModal';
import { BASE_LAYERS } from './components/LayerControl';
import L from 'leaflet';

const BHILAI_CENTER = { lat: 21.2092, lng: 81.4285 };
const DEFAULT_ZOOM = 13;

export default function App() {
  // Map and View State
  const [mapInstance, setMapInstance] = useState(null);
  const [mapCenter, setMapCenter] = useState(BHILAI_CENTER);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const [currentLocationName, setCurrentLocationName] = useState('Bhilai (21.2092°N, 81.4285°E)');
  const [cursorCoords, setCursorCoords] = useState(null);

  // Layer State
  const [activeBaseLayerId, setActiveBaseLayerId] = useState('esri-imagery');
  const [activeOverlays, setActiveOverlays] = useState(['esri-places']);
  const [layerOpacity, setLayerOpacity] = useState(1.0);

  // Drawing and Selection State
  const [activeDrawMode, setActiveDrawMode] = useState('pan');
  const [activeSelection, setActiveSelection] = useState(null);

  // UI Panel State
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSidebarTab, setActiveSidebarTab] = useState('search');
  const [isPayloadModalOpen, setIsPayloadModalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Handle Layer Selection
  const handleSelectBaseLayer = (layerId) => {
    setActiveBaseLayerId(layerId);
  };

  const handleToggleOverlay = (overlayId) => {
    setActiveOverlays((prev) =>
      prev.includes(overlayId)
        ? prev.filter((id) => id !== overlayId)
        : [...prev, overlayId]
    );
  };

  // Handle Map Navigation & Fly-To
  const handleSelectLocation = (loc) => {
    if (!mapInstance) return;
    setCurrentLocationName(loc.name || loc.displayName);

    if (loc.bbox) {
      const bounds = L.latLngBounds(
        [loc.bbox[0], loc.bbox[1]],
        [loc.bbox[2], loc.bbox[3]]
      );
      mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    } else {
      mapInstance.flyTo([loc.lat, loc.lon], loc.zoom || 14, { duration: 1.5 });
    }
  };

  const handleFlyToCoordinates = (lat, lng, zoom = 14, name = 'Custom Coordinates') => {
    if (!mapInstance) return;
    setCurrentLocationName(name);
    mapInstance.flyTo([lat, lng], zoom, { duration: 1.5 });
  };

  const handleResetToBhilai = () => {
    if (!mapInstance) return;
    setCurrentLocationName('Bhilai, Chhattisgarh');
    mapInstance.flyTo([BHILAI_CENTER.lat, BHILAI_CENTER.lng], DEFAULT_ZOOM, { duration: 1.2 });
  };

  // Handle Selections
  const handleSelectionChange = (newSelection) => {
    setActiveSelection(newSelection);
    setActiveSidebarTab('draw');
  };

  const handleClearSelection = () => {
    setActiveSelection(null);
    setActiveDrawMode('pan');
  };

  const handleFitSelection = () => {
    if (!mapInstance || !activeSelection) return;

    if (activeSelection.type === 'bbox' && activeSelection.bbox) {
      const [minLat, minLng, maxLat, maxLng] = activeSelection.bbox;
      mapInstance.fitBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [50, 50] });
    } else if (activeSelection.type === 'polygon' && activeSelection.points) {
      const bounds = L.latLngBounds(activeSelection.points);
      mapInstance.fitBounds(bounds, { padding: [50, 50] });
    } else if (activeSelection.type === 'point') {
      mapInstance.flyTo([activeSelection.lat, activeSelection.lon], 16);
    }
  };

  const handleSelectPresetAOI = (aoi) => {
    setActiveSelection(aoi);
    setActiveDrawMode('pan');
    setActiveSidebarTab('draw');

    if (mapInstance) {
      if (aoi.bbox) {
        mapInstance.fitBounds([[aoi.bbox[0], aoi.bbox[1]], [aoi.bbox[2], aoi.bbox[3]]], { padding: [60, 60] });
      } else if (aoi.points) {
        mapInstance.fitBounds(L.latLngBounds(aoi.points), { padding: [60, 60] });
      }
    }
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const activeBaseLayer = BASE_LAYERS.find((l) => l.id === activeBaseLayerId);

  return (
    <div className="gis-app-root">
      {/* Top Header */}
      <Header
        mapCenter={mapCenter}
        currentLocationName={currentLocationName}
        onResetView={handleResetToBhilai}
        onOpenPayloadModal={() => setIsPayloadModalOpen(true)}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        sidebarOpen={sidebarOpen}
        activeSelection={activeSelection}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
      />

      {/* Main App Workspace */}
      <div className="gis-workspace-body">
        {/* Left GIS Control Sidebar */}
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          activeTab={activeSidebarTab}
          onChangeTab={(tab) => {
            setActiveSidebarTab(tab);
            if (!sidebarOpen) setSidebarOpen(true);
          }}
          onSelectLocation={handleSelectLocation}
          onFlyToCoordinates={handleFlyToCoordinates}
          activeBaseLayerId={activeBaseLayerId}
          onSelectBaseLayer={handleSelectBaseLayer}
          activeOverlays={activeOverlays}
          onToggleOverlay={handleToggleOverlay}
          layerOpacity={layerOpacity}
          onChangeOpacity={setLayerOpacity}
          activeDrawMode={activeDrawMode}
          onChangeDrawMode={setActiveDrawMode}
          activeSelection={activeSelection}
          onClearSelection={handleClearSelection}
          onOpenPayloadModal={() => setIsPayloadModalOpen(true)}
          onFitSelection={handleFitSelection}
          onSelectPresetAOI={handleSelectPresetAOI}
        />

        {/* Central Map Canvas */}
        <main className="gis-map-viewport">
          <MapEngine
            center={[BHILAI_CENTER.lat, BHILAI_CENTER.lng]}
            zoom={DEFAULT_ZOOM}
            activeBaseLayerId={activeBaseLayerId}
            activeOverlays={activeOverlays}
            layerOpacity={layerOpacity}
            activeDrawMode={activeDrawMode}
            onChangeDrawMode={setActiveDrawMode}
            activeSelection={activeSelection}
            onSelectionChange={handleSelectionChange}
            onCursorMove={setCursorCoords}
            onMapCenterChange={setMapCenter}
            onZoomChange={setZoomLevel}
            registerMapInstance={setMapInstance}
          />
        </main>
      </div>

      {/* Bottom Coordinate & Measurement HUD */}
      <CoordinateHUD
        cursorCoords={cursorCoords}
        mapCenter={mapCenter}
        zoomLevel={zoomLevel}
        activeSelection={activeSelection}
        activeBaseLayerName={activeBaseLayer?.name}
      />

      {/* GeoJSON & Backend Payload Modal */}
      <SelectionDetailsModal
        isOpen={isPayloadModalOpen}
        onClose={() => setIsPayloadModalOpen(false)}
        selection={activeSelection}
        mapCenter={mapCenter}
      />
    </div>
  );
}

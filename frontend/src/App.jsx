import React, { useState } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MapEngine from './components/MapEngine';
import CoordinateHUD from './components/CoordinateHUD';
import SelectionDetailsModal from './components/SelectionDetailsModal';
import { BASE_LAYERS } from './components/LayerControl';
import { runFullHydrologyAnalysis, fetchRunoffEstimation, fetchPondRecommendation } from './services/apiService';
import confetti from 'canvas-confetti';
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

  // Hydrology Analysis State
  const [analysisData, setAnalysisData] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [activeHydrologyLayers, setActiveHydrologyLayers] = useState({
    contours: true,
    catchment: true,
    sinks: true,
    streams: true
  });

  // UI Panel State
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSidebarTab, setActiveSidebarTab] = useState('search');
  const [isPayloadModalOpen, setIsPayloadModalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Handle Base Layer Selection
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

  // Toggle Hydrology Map Overlays
  const handleToggleHydrologyLayer = (layerKey) => {
    setActiveHydrologyLayers((prev) => ({
      ...prev,
      [layerKey]: !prev[layerKey]
    }));
  };

  // Run Full AI Hydrology Analysis
  const handleRunAnalysis = async () => {
    setAnalysisLoading(true);
    try {
      let lat = BHILAI_CENTER.lat;
      let lon = BHILAI_CENTER.lng;
      let bbox = null;

      if (activeSelection) {
        if (activeSelection.type === 'point') {
          lat = activeSelection.lat;
          lon = activeSelection.lon;
          bbox = activeSelection.bbox;
        } else if (activeSelection.type === 'bbox') {
          lat = activeSelection.center?.lat || mapCenter.lat;
          lon = activeSelection.center?.lng || mapCenter.lng;
          bbox = activeSelection.bbox;
        } else if (activeSelection.type === 'polygon') {
          lat = activeSelection.center?.lat || mapCenter.lat;
          lon = activeSelection.center?.lng || mapCenter.lng;
          bbox = activeSelection.bbox;
        }
      } else {
        lat = mapCenter.lat;
        lon = mapCenter.lng;
        bbox = [lat - 0.02, lon - 0.02, lat + 0.02, lon + 0.02];
      }

      const result = await runFullHydrologyAnalysis(lat, lon, bbox);
      setAnalysisData(result);
      setActiveSidebarTab('hydro');
      if (!sidebarOpen) setSidebarOpen(true);

      // Trigger celebratory confetti on completion
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (err) {
      alert(`Hydrology Analysis notice: ${err.message || 'Please make sure FastAPI backend is running on port 8000.'}`);
    } finally {
      setAnalysisLoading(false);
    }
  };

  // Dynamic Runoff Slider Re-calculation
  const handleUpdateRunoffCoeff = async (newC) => {
    if (!analysisData) return;
    try {
      const catchmentAreaM2 = analysisData.catchment.properties.area_sq_meters;
      const annualRainfallMm = analysisData.rainfall.annual_rainfall_mm;
      const slope = analysisData.catchment.properties.avg_slope_percent;

      const newRunoff = await fetchRunoffEstimation(catchmentAreaM2, annualRainfallMm, 'cultivated_clay_loam', newC);
      const newPond = await fetchPondRecommendation(newRunoff.annual_runoff_volume_m3, catchmentAreaM2, slope, 25.0);

      setAnalysisData((prev) => ({
        ...prev,
        runoff: newRunoff,
        pond_recommendation: newPond
      }));
    } catch (err) {
      console.error('Error updating runoff coefficient:', err);
    }
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
          analysisData={analysisData}
          analysisLoading={analysisLoading}
          onRunAnalysis={handleRunAnalysis}
          activeHydrologyLayers={activeHydrologyLayers}
          onToggleHydrologyLayer={handleToggleHydrologyLayer}
          onUpdateRunoffCoeff={handleUpdateRunoffCoeff}
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
            analysisData={analysisData}
            activeHydrologyLayers={activeHydrologyLayers}
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

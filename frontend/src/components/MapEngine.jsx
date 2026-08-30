import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BASE_LAYERS, OVERLAYS } from './LayerControl';
import { calculatePolygonArea, calculateBBoxArea, calculatePerimeter, formatArea } from '../services/geoUtils';
import { Check, Undo2, X, Square, Hexagon, MapPin, Sparkles } from 'lucide-react';

// Fix default Leaflet icon paths in Vite / React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom SVG Pond Marker Icon
const pondMarkerIcon = L.divIcon({
  className: 'custom-pond-marker-pin',
  html: `
    <div class="pond-pin-wrapper">
      <div class="pond-pin-pulse"></div>
      <div class="pond-pin-core">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    </div>
  `,
  iconSize: [36, 42],
  iconAnchor: [18, 42],
  popupAnchor: [0, -40],
});

// Custom Natural Sink Marker Icon
const createSinkIcon = (idx, score) => L.divIcon({
  className: 'custom-sink-marker-pin',
  html: `
    <div class="sink-pin-badge">
      <span class="sink-badge-rank">#${idx}</span>
      <span class="sink-badge-score">${score}%</span>
    </div>
  `,
  iconSize: [44, 24],
  iconAnchor: [22, 12],
});

export default function MapEngine({
  center = [21.2092, 81.4285],
  zoom = 13,
  activeBaseLayerId = 'esri-imagery',
  activeOverlays = ['esri-places'],
  layerOpacity = 1.0,
  activeDrawMode = 'pan',
  onChangeDrawMode,
  activeSelection,
  onSelectionChange,
  onCursorMove,
  onMapCenterChange,
  onZoomChange,
  registerMapInstance,
  analysisData,
  activeHydrologyLayers = { contours: true, catchment: true, sinks: true, streams: true }
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const baseLayersRef = useRef({});
  const overlayLayersRef = useRef({});
  
  // Layer groups for selections & hydrology overlays
  const drawnItemsGroupRef = useRef(null);
  const tempDrawLayerRef = useRef(null);
  const contoursLayerRef = useRef(null);
  const catchmentLayerRef = useRef(null);
  const sinksLayerRef = useRef(null);

  // Keep latest callback references in refs to prevent useEffect re-runs
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onChangeDrawModeRef = useRef(onChangeDrawMode);
  onSelectionChangeRef.current = onSelectionChange;
  onChangeDrawModeRef.current = onChangeDrawMode;

  // Drawing state tracked in state for UI display
  const [polygonVertexCount, setPolygonVertexCount] = useState(0);
  const [isBboxStarted, setIsBboxStarted] = useState(false);
  const [provisionalArea, setProvisionalArea] = useState(null);

  // Persistent in-memory drawing points across mousemove events
  const drawingPointsRef = useRef([]);
  const bboxStartPointRef = useRef(null);

  // 1. Initialize Map Once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: center,
      zoom: zoom,
      zoomControl: false,
      attributionControl: true,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

    // Initialize Base Tile Layers
    BASE_LAYERS.forEach((layer) => {
      const tileLayer = L.tileLayer(layer.url, {
        attribution: layer.attribution,
        maxZoom: layer.maxZoom || 19,
        opacity: layerOpacity,
      });
      baseLayersRef.current[layer.id] = tileLayer;
    });

    // Add Default Base Layer (Esri World Imagery)
    const initialLayer = baseLayersRef.current[activeBaseLayerId] || baseLayersRef.current['esri-imagery'];
    if (initialLayer) {
      initialLayer.addTo(map);
    }

    // Initialize Overlays
    OVERLAYS.forEach((overlay) => {
      const overlayLayer = L.tileLayer(overlay.url, {
        maxZoom: 19,
        zIndex: 50,
      });
      overlayLayersRef.current[overlay.id] = overlayLayer;
      if (activeOverlays.includes(overlay.id)) {
        overlayLayer.addTo(map);
      }
    });

    // Layer groups
    drawnItemsGroupRef.current = L.featureGroup().addTo(map);
    tempDrawLayerRef.current = L.featureGroup().addTo(map);
    contoursLayerRef.current = L.featureGroup().addTo(map);
    catchmentLayerRef.current = L.featureGroup().addTo(map);
    sinksLayerRef.current = L.featureGroup().addTo(map);

    // Map Event Listeners
    let lastMoveTime = 0;
    map.on('mousemove', (e) => {
      const now = performance.now();
      if (now - lastMoveTime > 30) {
        lastMoveTime = now;
        if (onCursorMove) {
          onCursorMove({ lat: e.latlng.lat, lng: e.latlng.lng });
        }
      }
    });

    map.on('move', () => {
      const c = map.getCenter();
      if (onMapCenterChange) {
        onMapCenterChange({ lat: c.lat, lng: c.lng });
      }
    });

    map.on('zoomend', () => {
      if (onZoomChange) {
        onZoomChange(map.getZoom());
      }
    });

    // Prevent default browser text selection on map container
    const container = mapContainerRef.current;
    const preventSelection = (e) => e.preventDefault();
    container.addEventListener('selectstart', preventSelection);
    container.addEventListener('dragstart', preventSelection);

    mapInstanceRef.current = map;
    if (registerMapInstance) {
      registerMapInstance(map);
    }

    return () => {
      container.removeEventListener('selectstart', preventSelection);
      container.removeEventListener('dragstart', preventSelection);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Update Base Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    Object.keys(baseLayersRef.current).forEach((layerId) => {
      const layer = baseLayersRef.current[layerId];
      if (layerId === activeBaseLayerId) {
        if (!map.hasLayer(layer)) {
          map.addLayer(layer);
        }
      } else {
        if (map.hasLayer(layer)) {
          map.removeLayer(layer);
        }
      }
    });
  }, [activeBaseLayerId]);

  // 3. Update Overlays
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    Object.keys(overlayLayersRef.current).forEach((overlayId) => {
      const layer = overlayLayersRef.current[overlayId];
      const shouldBeActive = activeOverlays.includes(overlayId);
      if (shouldBeActive && !map.hasLayer(layer)) {
        map.addLayer(layer);
      } else if (!shouldBeActive && map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
  }, [activeOverlays]);

  // 4. Update Opacity
  useEffect(() => {
    Object.values(baseLayersRef.current).forEach((layer) => {
      if (layer && typeof layer.setOpacity === 'function') {
        layer.setOpacity(layerOpacity);
      }
    });
  }, [layerOpacity]);

  // 5. Finalize Polygon Selection
  const finalizePolygon = () => {
    const pts = drawingPointsRef.current;
    if (!pts || pts.length < 3) return;

    const areaM2 = calculatePolygonArea(pts);
    const perimeterM = calculatePerimeter(pts);
    
    const latList = pts.map(p => p.lat);
    const lngList = pts.map(p => p.lng);

    const minLat = Math.min(...latList);
    const maxLat = Math.max(...latList);
    const minLng = Math.min(...lngList);
    const maxLng = Math.max(...lngList);

    const avgLat = latList.reduce((acc, v) => acc + v, 0) / latList.length;
    const avgLng = lngList.reduce((acc, v) => acc + v, 0) / lngList.length;

    const newSelection = {
      type: 'polygon',
      name: `Village Catchment Area (${pts.length} Vertices)`,
      points: pts.map(p => [p.lat, p.lng]),
      bbox: [minLat, minLng, maxLat, maxLng],
      center: { lat: avgLat, lng: avgLng },
      areaSqMeters: areaM2,
      areaHectares: areaM2 / 10000,
      perimeterMeters: perimeterM,
    };

    drawingPointsRef.current = [];
    setPolygonVertexCount(0);
    setProvisionalArea(null);
    if (tempDrawLayerRef.current) tempDrawLayerRef.current.clearLayers();

    if (onChangeDrawModeRef.current) onChangeDrawModeRef.current('pan');
    if (onSelectionChangeRef.current) onSelectionChangeRef.current(newSelection);
  };

  // 6. Finalize Bounding Box Selection
  const finalizeBBox = (startPt, endPt) => {
    if (!startPt || !endPt) return;

    const minLat = Math.min(startPt.lat, endPt.lat);
    const maxLat = Math.max(startPt.lat, endPt.lat);
    const minLng = Math.min(startPt.lng, endPt.lng);
    const maxLng = Math.max(startPt.lng, endPt.lng);

    if (Math.abs(maxLat - minLat) < 0.0002 && Math.abs(maxLng - minLng) < 0.0002) {
      bboxStartPointRef.current = null;
      setIsBboxStarted(false);
      if (tempDrawLayerRef.current) tempDrawLayerRef.current.clearLayers();
      return;
    }

    const bbox = [minLat, minLng, maxLat, maxLng];
    const areaM2 = calculateBBoxArea(bbox);
    const perimeterM = calculatePerimeter([
      [minLat, minLng],
      [maxLat, minLng],
      [maxLat, maxLng],
      [minLat, maxLng],
    ]);
    const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };

    const widthKm = (Math.abs(maxLng - minLng) * 111.32 * Math.cos((center.lat * Math.PI) / 180)).toFixed(2);
    const heightKm = (Math.abs(maxLat - minLat) * 110.57).toFixed(2);

    const newSelection = {
      type: 'bbox',
      name: `Bounding Box (${widthKm} km × ${heightKm} km)`,
      bbox: bbox,
      points: [
        [minLat, minLng],
        [maxLat, minLng],
        [maxLat, maxLng],
        [minLat, maxLng],
      ],
      center: center,
      areaSqMeters: areaM2,
      areaHectares: areaM2 / 10000,
      perimeterMeters: perimeterM,
    };

    bboxStartPointRef.current = null;
    setIsBboxStarted(false);
    setProvisionalArea(null);
    if (tempDrawLayerRef.current) tempDrawLayerRef.current.clearLayers();

    if (onChangeDrawModeRef.current) onChangeDrawModeRef.current('pan');
    if (onSelectionChangeRef.current) onSelectionChangeRef.current(newSelection);
  };

  // 7. Render Polygon Temp Layer
  const renderPolygonPreview = (cursorLatLng = null) => {
    const tempGroup = tempDrawLayerRef.current;
    if (!tempGroup) return;

    tempGroup.clearLayers();
    const pts = drawingPointsRef.current;
    if (!pts || pts.length === 0) return;

    pts.forEach((p, idx) => {
      const isFirst = idx === 0;
      L.circleMarker(p, {
        radius: isFirst ? 7 : 5,
        color: '#ffffff',
        fillColor: isFirst ? '#10b981' : '#00f2fe',
        fillOpacity: 1,
        weight: 2,
      }).addTo(tempGroup);
    });

    if (pts.length >= 2) {
      L.polyline(pts, {
        color: '#10b981',
        weight: 3,
      }).addTo(tempGroup);
    }

    if (cursorLatLng && pts.length > 0) {
      const lastPt = pts[pts.length - 1];
      L.polyline([lastPt, cursorLatLng], {
        color: '#00f2fe',
        weight: 2,
        dashArray: '5, 5',
      }).addTo(tempGroup);

      if (pts.length >= 2) {
        L.polygon([...pts, cursorLatLng], {
          color: '#10b981',
          weight: 1,
          dashArray: '4, 4',
          fillColor: '#10b981',
          fillOpacity: 0.15,
        }).addTo(tempGroup);
      }
    }
  };

  // 8. Render BBox Temp Layer
  const renderBBoxPreview = (startPt, cursorPt) => {
    const tempGroup = tempDrawLayerRef.current;
    if (!tempGroup || !startPt) return;

    tempGroup.clearLayers();

    L.circleMarker(startPt, {
      radius: 6,
      color: '#ffffff',
      fillColor: '#00f2fe',
      fillOpacity: 1,
      weight: 2,
    }).addTo(tempGroup);

    if (cursorPt) {
      const bounds = L.latLngBounds(startPt, cursorPt);
      L.rectangle(bounds, {
        color: '#00f2fe',
        weight: 2,
        dashArray: '6, 6',
        fillColor: '#00f2fe',
        fillOpacity: 0.2,
      }).addTo(tempGroup);
    }
  };

  // 9. Drawing Event Listeners Effect
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    drawingPointsRef.current = [];
    bboxStartPointRef.current = null;
    setPolygonVertexCount(0);
    setIsBboxStarted(false);
    setProvisionalArea(null);
    if (tempDrawLayerRef.current) tempDrawLayerRef.current.clearLayers();

    if (activeDrawMode === 'pan') {
      map.dragging.enable();
      map.doubleClickZoom.enable();
      map.getContainer().style.cursor = '';
      return;
    }

    map.getContainer().style.cursor = 'crosshair';

    // Point Mode
    if (activeDrawMode === 'point') {
      map.dragging.enable();
      const handlePointClick = (e) => {
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;

        const newSelection = {
          type: 'point',
          name: `Candidate Pond Site (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`,
          lat: lat,
          lon: lon,
          center: { lat, lng: lon },
          bbox: [lat - 0.008, lon - 0.008, lat + 0.008, lon + 0.008],
          areaSqMeters: 2500,
          areaHectares: 0.25,
        };

        if (onChangeDrawModeRef.current) onChangeDrawModeRef.current('pan');
        if (onSelectionChangeRef.current) onSelectionChangeRef.current(newSelection);
      };

      map.on('click', handlePointClick);
      return () => map.off('click', handlePointClick);
    }

    // BBox Mode
    if (activeDrawMode === 'bbox') {
      map.dragging.disable();

      const handleBBoxClick = (e) => {
        if (!bboxStartPointRef.current) {
          const start = e.latlng;
          bboxStartPointRef.current = start;
          setIsBboxStarted(true);
          renderBBoxPreview(start, null);
        } else {
          const start = bboxStartPointRef.current;
          const end = e.latlng;
          finalizeBBox(start, end);
        }
      };

      const handleBBoxMouseMove = (e) => {
        const start = bboxStartPointRef.current;
        if (!start) return;

        const current = e.latlng;
        renderBBoxPreview(start, current);

        const minLat = Math.min(start.lat, current.lat);
        const maxLat = Math.max(start.lat, current.lat);
        const minLng = Math.min(start.lng, current.lng);
        const maxLng = Math.max(start.lng, current.lng);

        const areaM2 = calculateBBoxArea([minLat, minLng, maxLat, maxLng]);
        setProvisionalArea(formatArea(areaM2));
      };

      map.on('click', handleBBoxClick);
      map.on('mousemove', handleBBoxMouseMove);

      return () => {
        map.off('click', handleBBoxClick);
        map.off('mousemove', handleBBoxMouseMove);
        map.dragging.enable();
      };
    }

    // Polygon Mode
    if (activeDrawMode === 'polygon') {
      map.doubleClickZoom.disable();
      map.dragging.enable();

      const handlePolygonClick = (e) => {
        const pt = e.latlng;
        const currentPoints = drawingPointsRef.current;

        if (currentPoints.length >= 3) {
          const firstPt = currentPoints[0];
          const dist = map.distance(firstPt, pt);
          if (dist < 30) {
            finalizePolygon();
            return;
          }
        }

        currentPoints.push(pt);
        setPolygonVertexCount(currentPoints.length);

        if (currentPoints.length >= 3) {
          const areaM2 = calculatePolygonArea(currentPoints);
          setProvisionalArea(formatArea(areaM2));
        }

        renderPolygonPreview(pt);
      };

      const handlePolygonMouseMove = (e) => {
        if (drawingPointsRef.current.length > 0) {
          renderPolygonPreview(e.latlng);
        }
      };

      const handlePolygonDblClick = (e) => {
        L.DomEvent.stopPropagation(e);
        if (drawingPointsRef.current.length >= 3) {
          finalizePolygon();
        }
      };

      map.on('click', handlePolygonClick);
      map.on('mousemove', handlePolygonMouseMove);
      map.on('dblclick', handlePolygonDblClick);

      return () => {
        map.off('click', handlePolygonClick);
        map.off('mousemove', handlePolygonMouseMove);
        map.off('dblclick', handlePolygonDblClick);
        map.doubleClickZoom.enable();
      };
    }
  }, [activeDrawMode]);

  // Undo Last Polygon Point
  const handleUndoPolygonPoint = () => {
    if (drawingPointsRef.current.length <= 1) {
      drawingPointsRef.current = [];
      setPolygonVertexCount(0);
      setProvisionalArea(null);
      if (tempDrawLayerRef.current) tempDrawLayerRef.current.clearLayers();
    } else {
      drawingPointsRef.current.pop();
      setPolygonVertexCount(drawingPointsRef.current.length);
      if (drawingPointsRef.current.length >= 3) {
        setProvisionalArea(formatArea(calculatePolygonArea(drawingPointsRef.current)));
      } else {
        setProvisionalArea(null);
      }
      renderPolygonPreview(null);
    }
  };

  // Cancel Drawing
  const handleCancelDrawing = () => {
    drawingPointsRef.current = [];
    bboxStartPointRef.current = null;
    setPolygonVertexCount(0);
    setIsBboxStarted(false);
    setProvisionalArea(null);
    if (tempDrawLayerRef.current) tempDrawLayerRef.current.clearLayers();
    if (onChangeDrawModeRef.current) onChangeDrawModeRef.current('pan');
  };

  // 10. Render Active Selection
  useEffect(() => {
    const drawnItems = drawnItemsGroupRef.current;
    const map = mapInstanceRef.current;
    if (!drawnItems || !map) return;

    drawnItems.clearLayers();
    if (!activeSelection) return;

    if (activeSelection.type === 'bbox' && activeSelection.bbox) {
      const [minLat, minLng, maxLat, maxLng] = activeSelection.bbox;
      const bounds = [[minLat, minLng], [maxLat, maxLng]];

      const rect = L.rectangle(bounds, {
        color: '#00f2fe',
        weight: 2.5,
        fillColor: '#00f2fe',
        fillOpacity: 0.18,
        className: 'glow-svg-rect',
      }).addTo(drawnItems);

      rect.bindTooltip(
        `<div class="gis-tooltip-content">
          <strong>${activeSelection.name}</strong>
          <span>Area: ${(activeSelection.areaHectares || 0).toFixed(2)} ha</span>
        </div>`,
        { permanent: true, direction: 'center', className: 'gis-map-tooltip' }
      );
    } else if (activeSelection.type === 'polygon' && activeSelection.points) {
      const poly = L.polygon(activeSelection.points, {
        color: '#10b981',
        weight: 2.5,
        fillColor: '#10b981',
        fillOpacity: 0.22,
        className: 'glow-svg-polygon',
      }).addTo(drawnItems);

      poly.bindTooltip(
        `<div class="gis-tooltip-content">
          <strong>${activeSelection.name}</strong>
          <span>Area: ${(activeSelection.areaHectares || 0).toFixed(2)} ha</span>
        </div>`,
        { permanent: true, direction: 'center', className: 'gis-map-tooltip' }
      );
    } else if (activeSelection.type === 'point' && activeSelection.lat && activeSelection.lon) {
      const marker = L.marker([activeSelection.lat, activeSelection.lon], {
        icon: pondMarkerIcon,
      }).addTo(drawnItems);

      marker.bindPopup(
        `<div class="gis-popup-card">
          <h4>Candidate Pond Pour Point</h4>
          <p>Lat: ${activeSelection.lat.toFixed(5)}°N, Lon: ${activeSelection.lon.toFixed(5)}°E</p>
          <div class="popup-tag">Ready for Catchment Delineation</div>
        </div>`
      ).openPopup();
    }
  }, [activeSelection]);

  // 11. Render Hydrology Analysis Layers (Contours, Catchment Polygon, Sinks, Streams)
  useEffect(() => {
    const contoursGroup = contoursLayerRef.current;
    const catchmentGroup = catchmentLayerRef.current;
    const sinksGroup = sinksLayerRef.current;
    const map = mapInstanceRef.current;
    if (!map || !contoursGroup || !catchmentGroup || !sinksGroup) return;

    contoursGroup.clearLayers();
    catchmentGroup.clearLayers();
    sinksGroup.clearLayers();

    if (!analysisData) return;

    // A. Render Elevation Contours
    if (activeHydrologyLayers.contours && analysisData.elevation?.contours_geojson) {
      const contours = analysisData.elevation.contours_geojson;
      L.geoJSON(contours, {
        style: (feature) => ({
          color: feature.properties.color || '#facc15',
          weight: feature.properties.weight || 1.5,
          opacity: feature.properties.opacity || 0.75,
          dashArray: feature.properties.is_index_contour ? '' : '3, 4',
        }),
        onEachFeature: (feature, layer) => {
          layer.bindTooltip(
            `Elevation: <strong>${feature.properties.level_label}</strong>`,
            { sticky: true, className: 'gis-map-tooltip contour-tooltip' }
          );
        },
      }).addTo(contoursGroup);
    }

    // B. Render Catchment Watershed Basin & Drainage Flow Vectors
    if (activeHydrologyLayers.catchment && analysisData.catchment) {
      const catchmentGeoJSON = analysisData.catchment;
      L.geoJSON(catchmentGeoJSON, {
        style: {
          color: '#38bdf8',
          weight: 3,
          fillColor: '#0284c7',
          fillOpacity: 0.28,
          className: 'glow-svg-catchment',
        },
        onEachFeature: (feature, layer) => {
          layer.bindTooltip(
            `<div class="gis-tooltip-content">
              <strong>${feature.properties.name}</strong>
              <span>Area: ${feature.properties.area_hectares} ha &bull; Slope: ${feature.properties.avg_slope_percent}%</span>
            </div>`,
            { permanent: true, direction: 'center', className: 'gis-map-tooltip' }
          );
        },
      }).addTo(catchmentGroup);

      // Render Stream Network
      if (catchmentGeoJSON.stream_network) {
        L.geoJSON(catchmentGeoJSON.stream_network, {
          style: {
            color: '#00f2fe',
            weight: 3.5,
            dashArray: '6, 4',
          },
        }).addTo(catchmentGroup);
      }
    }

    // C. Render Natural Sinks / Optimal Pond Depressions
    if (activeHydrologyLayers.sinks && analysisData.elevation?.natural_sinks) {
      const sinks = analysisData.elevation.natural_sinks;
      sinks.forEach((sink, idx) => {
        const marker = L.marker([sink.lat, sink.lon], {
          icon: createSinkIcon(idx + 1, Math.round(sink.suitability_score)),
        }).addTo(sinksGroup);

        marker.bindPopup(
          `<div class="gis-popup-card">
            <h4>Optimal Depression Sink #${idx + 1}</h4>
            <p>Score: <strong>${sink.suitability_score}%</strong></p>
            <p>Elevation: ${sink.elevation_m}m &bull; Slope: ${sink.slope_percent}%</p>
            <p>Natural Sink Depth: ${sink.depression_depth_m}m</p>
            <div class="popup-tag">High Runoff Confluence</div>
          </div>`
        );
      });
    }
  }, [analysisData, activeHydrologyLayers]);

  return (
    <div className="map-engine-wrapper">
      {/* Floating In-Map Active Drawing Controls Bar */}
      {activeDrawMode !== 'pan' && (
        <div className="map-active-draw-bar">
          <div className="draw-bar-status">
            {activeDrawMode === 'bbox' && <Square size={16} className="text-cyan animate-pulse" />}
            {activeDrawMode === 'polygon' && <Hexagon size={16} className="text-emerald animate-pulse" />}
            {activeDrawMode === 'point' && <MapPin size={16} className="text-cyan animate-pulse" />}

            <div className="draw-bar-text">
              <strong>
                {activeDrawMode === 'bbox' && (isBboxStarted ? 'Click opposite corner to finish BBox' : 'Click 1st corner of Bounding Box')}
                {activeDrawMode === 'polygon' && (polygonVertexCount === 0 ? 'Click map to place 1st vertex' : `Placed ${polygonVertexCount} vertex points`)}
                {activeDrawMode === 'point' && 'Click anywhere to place Candidate Pond'}
              </strong>
              {provisionalArea && (
                <span className="draw-bar-area">Live Area: {provisionalArea.hectares} ({provisionalArea.primary})</span>
              )}
            </div>
          </div>

          <div className="draw-bar-actions">
            {activeDrawMode === 'polygon' && polygonVertexCount > 0 && (
              <button 
                className="draw-action-btn secondary"
                onClick={handleUndoPolygonPoint}
                title="Undo last vertex"
              >
                <Undo2 size={14} />
                <span>Undo</span>
              </button>
            )}

            {activeDrawMode === 'polygon' && polygonVertexCount >= 3 && (
              <button 
                className="draw-action-btn primary"
                onClick={finalizePolygon}
                title="Finish and save polygon"
              >
                <Check size={14} />
                <span>Finish Polygon</span>
              </button>
            )}

            <button 
              className="draw-action-btn cancel"
              onClick={handleCancelDrawing}
              title="Cancel drawing"
            >
              <X size={14} />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}

      <div id="gis-map-canvas" ref={mapContainerRef} className="gis-map-canvas" />
    </div>
  );
}

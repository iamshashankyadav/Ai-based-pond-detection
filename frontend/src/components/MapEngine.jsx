import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BASE_LAYERS, OVERLAYS } from './LayerControl';
import { calculatePolygonArea, calculateBBoxArea, calculatePerimeter } from '../services/geoUtils';

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

export default function MapEngine({
  center = [21.2092, 81.4285],
  zoom = 13,
  activeBaseLayerId = 'esri-imagery',
  activeOverlays = ['esri-places'],
  layerOpacity = 1.0,
  activeDrawMode = 'pan',
  activeSelection,
  onSelectionChange,
  onCursorMove,
  onMapCenterChange,
  onZoomChange,
  registerMapInstance
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const baseLayersRef = useRef({});
  const overlayLayersRef = useRef({});
  const drawnItemsGroupRef = useRef(null);
  const tempDrawLayerRef = useRef(null);

  // State for polygon drawing in progress
  const polygonPointsRef = useRef([]);
  const bboxStartPointRef = useRef(null);
  const isDraggingBboxRef = useRef(false);

  // Initialize Map Once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Create Leaflet Map Instance
    const map = L.map(mapContainerRef.current, {
      center: center,
      zoom: zoom,
      zoomControl: false, // We'll add custom positioned controls
      attributionControl: true,
    });

    // Add Zoom Control to Top Right
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

    // Layer group for completed user selections
    const drawnItems = L.featureGroup().addTo(map);
    drawnItemsGroupRef.current = drawnItems;

    // Temporary layer for in-progress drawing
    const tempGroup = L.featureGroup().addTo(map);
    tempDrawLayerRef.current = tempGroup;

    // Map Event Listeners
    map.on('mousemove', (e) => {
      if (onCursorMove) {
        onCursorMove({ lat: e.latlng.lat, lng: e.latlng.lng });
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

    mapInstanceRef.current = map;
    if (registerMapInstance) {
      registerMapInstance(map);
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Base Layer when changed
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

  // Update Overlays
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

  // Update Opacity
  useEffect(() => {
    Object.values(baseLayersRef.current).forEach((layer) => {
      if (layer && typeof layer.setOpacity === 'function') {
        layer.setOpacity(layerOpacity);
      }
    });
  }, [layerOpacity]);

  // Handle Interactive Drawing Modes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Reset temporary layers and in-progress drawing states
    polygonPointsRef.current = [];
    bboxStartPointRef.current = null;
    isDraggingBboxRef.current = false;
    if (tempDrawLayerRef.current) {
      tempDrawLayerRef.current.clearLayers();
    }

    if (activeDrawMode === 'pan') {
      map.dragging.enable();
      map.getContainer().style.cursor = '';
      return;
    }

    map.getContainer().style.cursor = 'crosshair';

    // Handler: Point / Candidate Pond Mode
    const handleMapClickPoint = (e) => {
      if (activeDrawMode !== 'point') return;
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;

      const newSelection = {
        type: 'point',
        name: `Candidate Pond (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`,
        lat: lat,
        lon: lon,
        center: { lat, lng: lon },
      };

      onSelectionChange(newSelection);
    };

    // Handler: Bounding Box (Click-and-Drag or 2-Click) Mode
    const handleBBoxMouseDown = (e) => {
      if (activeDrawMode !== 'bbox') return;
      map.dragging.disable();
      bboxStartPointRef.current = e.latlng;
      isDraggingBboxRef.current = true;
      tempDrawLayerRef.current.clearLayers();
    };

    const handleBBoxMouseMove = (e) => {
      if (activeDrawMode !== 'bbox' || !isDraggingBboxRef.current || !bboxStartPointRef.current) return;
      
      const start = bboxStartPointRef.current;
      const current = e.latlng;
      
      const bounds = L.latLngBounds(start, current);
      tempDrawLayerRef.current.clearLayers();

      const previewRect = L.rectangle(bounds, {
        color: '#00f2fe',
        weight: 2,
        dashArray: '6, 6',
        fillColor: '#00f2fe',
        fillOpacity: 0.2,
      }).addTo(tempDrawLayerRef.current);
    };

    const handleBBoxMouseUp = (e) => {
      if (activeDrawMode !== 'bbox' || !isDraggingBboxRef.current || !bboxStartPointRef.current) return;
      isDraggingBboxRef.current = false;
      map.dragging.enable();

      const start = bboxStartPointRef.current;
      const end = e.latlng;

      const minLat = Math.min(start.lat, end.lat);
      const maxLat = Math.max(start.lat, end.lat);
      const minLng = Math.min(start.lng, end.lng);
      const maxLng = Math.max(start.lng, end.lng);

      // Check minimum drag distance
      if (Math.abs(maxLat - minLat) < 0.0005 && Math.abs(maxLng - minLng) < 0.0005) {
        tempDrawLayerRef.current.clearLayers();
        return;
      }

      const bbox = [minLat, minLng, maxLat, maxLng];
      const areaM2 = calculateBBoxArea(bbox);
      const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };

      const newSelection = {
        type: 'bbox',
        name: `BBox Region (${((maxLng - minLng) * 111).toFixed(1)}km x ${((maxLat - minLat) * 111).toFixed(1)}km)`,
        bbox: bbox,
        center: center,
        areaSqMeters: areaM2,
        areaHectares: areaM2 / 10000,
      };

      tempDrawLayerRef.current.clearLayers();
      onSelectionChange(newSelection);
    };

    // Handler: Polygon Mode (Click vertices)
    const handlePolygonClick = (e) => {
      if (activeDrawMode !== 'polygon') return;
      const pt = e.latlng;
      const points = [...polygonPointsRef.current, pt];
      polygonPointsRef.current = points;

      tempDrawLayerRef.current.clearLayers();

      // Draw vertex markers
      points.forEach((p, idx) => {
        L.circleMarker(p, {
          radius: 6,
          color: '#ffffff',
          fillColor: idx === 0 ? '#10b981' : '#00f2fe',
          fillOpacity: 1,
          weight: 2,
        }).addTo(tempDrawLayerRef.current);
      });

      // Draw polyline connecting points
      if (points.length >= 2) {
        L.polyline(points, {
          color: '#00f2fe',
          weight: 2.5,
          dashArray: '5, 5',
        }).addTo(tempDrawLayerRef.current);
      }
    };

    const handlePolygonDblClick = (e) => {
      if (activeDrawMode !== 'polygon') return;
      L.DomEvent.stopPropagation(e);
      const points = polygonPointsRef.current;
      if (points.length < 3) return;

      const areaM2 = calculatePolygonArea(points);
      const perimeterM = calculatePerimeter(points);
      
      const avgLat = points.reduce((acc, p) => acc + p.lat, 0) / points.length;
      const avgLng = points.reduce((acc, p) => acc + p.lng, 0) / points.length;

      const newSelection = {
        type: 'polygon',
        name: `Village Boundary (${points.length} vertices)`,
        points: points.map(p => [p.lat, p.lng]),
        center: { lat: avgLat, lng: avgLng },
        areaSqMeters: areaM2,
        areaHectares: areaM2 / 10000,
        perimeterMeters: perimeterM,
      };

      polygonPointsRef.current = [];
      tempDrawLayerRef.current.clearLayers();
      onSelectionChange(newSelection);
    };

    if (activeDrawMode === 'point') {
      map.on('click', handleMapClickPoint);
    } else if (activeDrawMode === 'bbox') {
      map.on('mousedown', handleBBoxMouseDown);
      map.on('mousemove', handleBBoxMouseMove);
      map.on('mouseup', handleBBoxMouseUp);
    } else if (activeDrawMode === 'polygon') {
      map.doubleClickZoom.disable();
      map.on('click', handlePolygonClick);
      map.on('dblclick', handlePolygonDblClick);
    }

    return () => {
      map.off('click', handleMapClickPoint);
      map.off('mousedown', handleBBoxMouseDown);
      map.off('mousemove', handleBBoxMouseMove);
      map.off('mouseup', handleBBoxMouseUp);
      map.off('click', handlePolygonClick);
      map.off('dblclick', handlePolygonDblClick);
      map.doubleClickZoom.enable();
      map.dragging.enable();
    };
  }, [activeDrawMode, onSelectionChange]);

  // Render Completed Selection Layer
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
        fillOpacity: 0.15,
        className: 'glow-svg-rect',
      }).addTo(drawnItems);

      rect.bindTooltip(
        `<strong>${activeSelection.name}</strong><br/>Area: ${(activeSelection.areaHectares || 0).toFixed(2)} ha`,
        { permanent: true, direction: 'center', className: 'gis-map-tooltip' }
      );
    } else if (activeSelection.type === 'polygon' && activeSelection.points) {
      const poly = L.polygon(activeSelection.points, {
        color: '#10b981',
        weight: 2.5,
        fillColor: '#10b981',
        fillOpacity: 0.2,
        className: 'glow-svg-polygon',
      }).addTo(drawnItems);

      poly.bindTooltip(
        `<strong>${activeSelection.name}</strong><br/>Area: ${(activeSelection.areaHectares || 0).toFixed(2)} ha`,
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

  return (
    <div className="map-engine-wrapper">
      <div id="gis-map-canvas" ref={mapContainerRef} className="gis-map-canvas" />
    </div>
  );
}

import React from 'react';
import { Compass, ZoomIn, MapPin, Activity, Globe } from 'lucide-react';
import { toDMS, formatArea } from '../services/geoUtils';

export default function CoordinateHUD({
  cursorCoords,
  mapCenter,
  zoomLevel,
  activeSelection,
  activeBaseLayerName
}) {
  const formattedArea = activeSelection?.areaSqMeters
    ? formatArea(activeSelection.areaSqMeters)
    : null;

  return (
    <div className="coordinate-hud">
      <div className="hud-group">
        <div className="hud-item">
          <Globe size={13} className="hud-icon" />
          <span className="hud-label">Layer:</span>
          <span className="hud-value">{activeBaseLayerName || 'Esri World Imagery'}</span>
        </div>

        <div className="hud-divider" />

        <div className="hud-item">
          <MapPin size={13} className="hud-icon" />
          <span className="hud-label">Center:</span>
          <span className="hud-value">
            {mapCenter
              ? `${mapCenter.lat.toFixed(4)}°N, ${mapCenter.lng.toFixed(4)}°E`
              : '21.2092°N, 81.4285°E'}
          </span>
        </div>

        {cursorCoords && (
          <>
            <div className="hud-divider" />
            <div className="hud-item cursor-active">
              <Compass size={13} className="hud-icon" />
              <span className="hud-label">Cursor:</span>
              <span className="hud-value">
                {cursorCoords.lat.toFixed(5)}°N, {cursorCoords.lng.toFixed(5)}°E
              </span>
              <span className="hud-sub">
                ({toDMS(cursorCoords.lat, true)}, {toDMS(cursorCoords.lng, false)})
              </span>
            </div>
          </>
        )}
      </div>

      <div className="hud-group right">
        {formattedArea && (
          <>
            <div className="hud-item highlight">
              <Activity size={13} className="hud-icon" />
              <span className="hud-label">AOI Area:</span>
              <span className="hud-value">{formattedArea.primary}</span>
              <span className="hud-sub">({formattedArea.hectares})</span>
            </div>
            <div className="hud-divider" />
          </>
        )}

        <div className="hud-item">
          <ZoomIn size={13} className="hud-icon" />
          <span className="hud-label">Zoom:</span>
          <span className="hud-value">{zoomLevel || 13}x</span>
        </div>
      </div>
    </div>
  );
}

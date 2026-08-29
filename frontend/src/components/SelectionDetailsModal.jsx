import React, { useState } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Download, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Code, 
  Server,
  Layers,
  Sparkles
} from 'lucide-react';
import { generateGeoJSON, formatArea } from '../services/geoUtils';
import { sendPayloadToBackend } from '../services/apiService';
import confetti from 'canvas-confetti';

export default function SelectionDetailsModal({
  isOpen,
  onClose,
  selection,
  mapCenter,
}) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [activeTab, setActiveTab] = useState('geojson'); // 'geojson' | 'apiPayload'

  if (!isOpen || !selection) return null;

  const geoJson = generateGeoJSON(selection);
  const formattedArea = selection.areaSqMeters ? formatArea(selection.areaSqMeters) : null;

  // Format backend API payload matching FastAPI endpoints in HLD
  const apiPayload = {
    selection_type: selection.type,
    name: selection.name || 'Village AOI Selection',
    bbox: selection.bbox || (selection.points ? [
      Math.min(...selection.points.map(p => Array.isArray(p) ? p[0] : p.lat)),
      Math.min(...selection.points.map(p => Array.isArray(p) ? p[1] : (p.lng || p.lon))),
      Math.max(...selection.points.map(p => Array.isArray(p) ? p[0] : p.lat)),
      Math.max(...selection.points.map(p => Array.isArray(p) ? p[1] : (p.lng || p.lon))),
    ] : [selection.lat - 0.01, selection.lon - 0.01, selection.lat + 0.01, selection.lon + 0.01]),
    polygon_coordinates: selection.type === 'polygon' ? selection.points.map(p => [
      Array.isArray(p) ? p[1] : (p.lng || p.lon),
      Array.isArray(p) ? p[0] : p.lat
    ]) : null,
    center: selection.center || { lat: selection.lat || mapCenter.lat, lon: selection.lon || mapCenter.lng },
    area_sq_meters: selection.areaSqMeters || 0,
    area_hectares: selection.areaHectares || (selection.areaSqMeters ? selection.areaSqMeters / 10000 : 0),
    target_endpoints: {
      elevation_dem: `/api/elevation?bbox=${(selection.bbox || []).join(',')}`,
      catchment_delineation: `/api/catchment`,
      historical_rainfall: `/api/rainfall?lat=${selection.center?.lat || selection.lat}&lon=${selection.center?.lng || selection.lon}&years=10`,
      runoff_volume: `/api/runoff`,
      pond_recommendation: `/api/pond/recommend`
    },
    metadata: {
      timestamp: new Date().toISOString(),
      source_base_layer: 'Esri World Imagery',
      client_platform: 'React Leaflet GIS Web Engine'
    }
  };

  const handleCopy = () => {
    const textToCopy = activeTab === 'geojson' 
      ? JSON.stringify(geoJson, null, 2)
      : JSON.stringify(apiPayload, null, 2);
    
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadGeoJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(geoJson, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `pond_aoi_${selection.type}_${Date.now()}.geojson`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleSendToBackend = async () => {
    setSending(true);
    setSendResult(null);
    try {
      const res = await sendPayloadToBackend(apiPayload);
      setSendResult({ success: true, data: res });
      confetti({
        particleCount: 75,
        spread: 60,
        origin: { y: 0.6 }
      });
    } catch (err) {
      setSendResult({ success: false, error: err.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon-badge">
              <Code size={18} />
            </div>
            <div>
              <h3>Area Selection & Backend Payload</h3>
              <p className="modal-subtitle">Ready for FastAPI Hydrology & Contour Processing</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* Quick Metrics Bar */}
          <div className="modal-metrics-bar">
            <div className="metric-pill">
              <span className="pill-label">Type</span>
              <span className="pill-val highlight">{selection.type.toUpperCase()}</span>
            </div>
            {formattedArea && (
              <div className="metric-pill">
                <span className="pill-label">Area</span>
                <span className="pill-val">{formattedArea.primary}</span>
              </div>
            )}
            {formattedArea && (
              <div className="metric-pill">
                <span className="pill-label">Hectares</span>
                <span className="pill-val">{formattedArea.hectares}</span>
              </div>
            )}
            <div className="metric-pill">
              <span className="pill-label">Coordinates</span>
              <span className="pill-val">
                {selection.center 
                  ? `${selection.center.lat.toFixed(4)}°, ${selection.center.lng.toFixed(4)}°`
                  : `${selection.lat?.toFixed(4)}°, ${selection.lon?.toFixed(4)}°`}
              </span>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="modal-tabs">
            <button
              className={`modal-tab ${activeTab === 'geojson' ? 'active' : ''}`}
              onClick={() => setActiveTab('geojson')}
            >
              <Layers size={15} />
              <span>Standard GeoJSON</span>
            </button>
            <button
              className={`modal-tab ${activeTab === 'apiPayload' ? 'active' : ''}`}
              onClick={() => setActiveTab('apiPayload')}
            >
              <Server size={15} />
              <span>Backend API Dispatch Body</span>
            </button>
          </div>

          {/* Code Viewer */}
          <div className="code-viewer-container">
            <pre className="code-pre">
              <code>
                {activeTab === 'geojson'
                  ? JSON.stringify(geoJson, null, 2)
                  : JSON.stringify(apiPayload, null, 2)}
              </code>
            </pre>
          </div>

          {/* Send Status Notification */}
          {sendResult && (
            <div className={`send-status-box ${sendResult.success ? 'success' : 'error'}`}>
              {sendResult.success ? (
                <>
                  <CheckCircle2 size={18} className="status-icon" />
                  <div className="status-text">
                    <strong>Payload Prepared & Validated!</strong>
                    <span>{sendResult.data.message || 'Ready for FastAPI microservices.'}</span>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle size={18} className="status-icon" />
                  <div className="status-text">
                    <strong>Dispatch Notice:</strong>
                    <span>{sendResult.error}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <div className="footer-left">
            <button className="footer-btn secondary" onClick={handleDownloadGeoJSON}>
              <Download size={15} />
              <span>Download .geojson</span>
            </button>
            <button className="footer-btn secondary" onClick={handleCopy}>
              {copied ? <Check size={15} className="text-emerald" /> : <Copy size={15} />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Code'}</span>
            </button>
          </div>

          <div className="footer-right">
            <button 
              className="footer-btn primary-action" 
              onClick={handleSendToBackend}
              disabled={sending}
            >
              <Send size={15} />
              <span>{sending ? 'Dispatching...' : 'Dispatch to Backend API'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

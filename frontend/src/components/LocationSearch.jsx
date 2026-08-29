import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Navigation, X, Loader2, Compass, ArrowRight } from 'lucide-react';
import { searchLocations, REGIONAL_PRESETS } from '../services/apiService';

export default function LocationSearch({ onSelectLocation, onFlyToCoordinates }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [customLat, setCustomLat] = useState('');
  const [customLng, setCustomLng] = useState('');
  const [showCoordJump, setShowCoordJump] = useState(false);

  const searchTimeout = useRef(null);
  const wrapperRef = useRef(null);

  // Debounced search
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    setLoading(true);
    searchTimeout.current = setTimeout(async () => {
      const data = await searchLocations(query);
      setResults(data);
      setLoading(false);
    }, 350);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [query]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectResult = (item) => {
    onSelectLocation(item);
    setQuery(item.name || item.displayName);
    setIsOpen(false);
  };

  const handleSelectPreset = (preset) => {
    onSelectLocation({
      id: preset.id,
      name: preset.name,
      displayName: `${preset.name}, ${preset.district}`,
      lat: preset.lat,
      lon: preset.lon,
      zoom: preset.zoom,
      bbox: [preset.lat - 0.025, preset.lon - 0.025, preset.lat + 0.025, preset.lon + 0.025],
    });
    setQuery(preset.name);
  };

  const handleCustomJump = (e) => {
    e.preventDefault();
    const lat = parseFloat(customLat);
    const lng = parseFloat(customLng);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      onFlyToCoordinates(lat, lng, 14, `Coord [${lat.toFixed(4)}, ${lng.toFixed(4)}]`);
      setShowCoordJump(false);
    } else {
      alert('Please enter valid Latitude (-90 to 90) and Longitude (-180 to 180).');
    }
  };

  return (
    <div className="location-search-container" ref={wrapperRef}>
      <div className="search-input-wrapper">
        <Search size={18} className="search-icon" />
        <input
          type="text"
          className="search-input"
          placeholder="Search village, tehsil, or district (e.g. Patan, Durg)..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        {loading && <Loader2 size={16} className="search-spinner" />}
        {query && !loading && (
          <button
            className="clear-search-btn"
            onClick={() => {
              setQuery('');
              setResults([]);
            }}
            title="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && (results.length > 0 || (query.length >= 2 && !loading)) && (
        <div className="search-dropdown">
          {results.length > 0 ? (
            results.map((item) => (
              <div
                key={item.id || item.lat + '-' + item.lon}
                className="search-result-item"
                onClick={() => handleSelectResult(item)}
              >
                <MapPin size={16} className="result-pin" />
                <div className="result-info">
                  <span className="result-title">{item.name}</span>
                  <span className="result-sub">{item.subtitle || item.displayName}</span>
                </div>
                <div className="result-coords">
                  {item.lat.toFixed(3)}°, {item.lon.toFixed(3)}°
                </div>
              </div>
            ))
          ) : (
            <div className="search-no-results">
              No matching locations found for "{query}". Try regional presets below.
            </div>
          )}
        </div>
      )}

      {/* Regional Presets Section */}
      <div className="presets-section">
        <div className="presets-header">
          <div className="presets-title">
            <Compass size={14} />
            <span>Bhilai & Chhattisgarh Regional Presets</span>
          </div>
          <button 
            className="coord-jump-toggle-btn"
            onClick={() => setShowCoordJump(!showCoordJump)}
            title="Jump to custom Lat/Lon coordinates"
          >
            <Navigation size={12} />
            <span>{showCoordJump ? 'Hide Jumper' : 'Custom Lat/Lon'}</span>
          </button>
        </div>

        {showCoordJump && (
          <form className="coord-jump-form" onSubmit={handleCustomJump}>
            <div className="coord-inputs">
              <input
                type="number"
                step="0.0001"
                placeholder="Lat (e.g. 21.2092)"
                value={customLat}
                onChange={(e) => setCustomLat(e.target.value)}
                required
              />
              <input
                type="number"
                step="0.0001"
                placeholder="Lon (e.g. 81.4285)"
                value={customLng}
                onChange={(e) => setCustomLng(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="coord-jump-btn">
              <span>Fly To Coordinates</span>
              <ArrowRight size={14} />
            </button>
          </form>
        )}

        <div className="preset-chips-grid">
          {REGIONAL_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className="preset-chip"
              onClick={() => handleSelectPreset(preset)}
              title={`${preset.district} (${preset.type})`}
            >
              <div className="preset-chip-top">
                <span className="preset-chip-name">{preset.name}</span>
              </div>
              <span className="preset-chip-sub">{preset.district.split(',')[0]} &bull; {preset.type}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

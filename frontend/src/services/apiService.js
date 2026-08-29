/**
 * API Service for Geocoding and Backend Communication
 */

const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// Chhattisgarh & Bhilai Region Quick Presets
export const REGIONAL_PRESETS = [
  {
    id: 'bhilai-core',
    name: 'Bhilai (Sector Core)',
    district: 'Durg, Chhattisgarh',
    lat: 21.2092,
    lon: 81.4285,
    zoom: 13,
    type: 'Urban / Sub-basin',
  },
  {
    id: 'durg-rural',
    name: 'Durg Rural (Shivnath Basin)',
    district: 'Durg, Chhattisgarh',
    lat: 21.1904,
    lon: 81.2849,
    zoom: 14,
    type: 'Riparian / Agricultural',
  },
  {
    id: 'patan-block',
    name: 'Patan Tehsil (Village Cluster)',
    district: 'Durg, Chhattisgarh',
    lat: 21.0375,
    lon: 81.5367,
    zoom: 14,
    type: 'Village Farmland',
  },
  {
    id: 'jamul-basin',
    name: 'Jamul Limestone Catchment',
    district: 'Durg, Chhattisgarh',
    lat: 21.2461,
    lon: 81.3989,
    zoom: 14,
    type: 'Terrain Depressions',
  },
  {
    id: 'utai-village',
    name: 'Utai Agricultural Lands',
    district: 'Durg, Chhattisgarh',
    lat: 21.1278,
    lon: 81.3912,
    zoom: 14,
    type: 'Pond Priority Zone',
  },
  {
    id: 'raipur-kharun',
    name: 'Raipur (Kharun River Basin)',
    district: 'Raipur, Chhattisgarh',
    lat: 21.2514,
    lon: 81.6296,
    zoom: 13,
    type: 'Regional Watershed',
  },
  {
    id: 'rajnandgaon-west',
    name: 'Rajnandgaon Catchment',
    district: 'Rajnandgaon, Chhattisgarh',
    lat: 21.0974,
    lon: 81.0360,
    zoom: 13,
    type: 'High Runoff Terrain',
  },
  {
    id: 'gunderdehi-rural',
    name: 'Gunderdehi Canal Belt',
    district: 'Balod, Chhattisgarh',
    lat: 20.9419,
    lon: 81.2917,
    zoom: 14,
    type: 'Rainwater Harvesting',
  }
];

/**
 * Search locations using OpenStreetMap Nominatim Geocoding API
 */
export async function searchLocations(query) {
  if (!query || query.trim().length < 2) return [];

  try {
    const encoded = encodeURIComponent(query.trim());
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&countrycodes=in&limit=6&addressdetails=1`;
    
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) {
      throw new Error(`Geocoding HTTP error: ${response.status}`);
    }

    const data = await response.json();
    return data.map((item) => {
      const addr = item.address || {};
      const villageName = addr.village || addr.town || addr.city || addr.suburb || addr.hamlet || item.name;
      const stateDistrict = [addr.county || addr.state_district, addr.state].filter(Boolean).join(', ');

      return {
        id: item.place_id,
        name: villageName,
        displayName: item.display_name,
        subtitle: stateDistrict || item.display_name.split(',').slice(1, 3).join(','),
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        bbox: item.boundingbox ? [
          parseFloat(item.boundingbox[0]),
          parseFloat(item.boundingbox[2]),
          parseFloat(item.boundingbox[1]),
          parseFloat(item.boundingbox[3]),
        ] : null,
      };
    });
  } catch (err) {
    console.warn('Nominatim search failed, returning regional matches:', err);
    // Local fallback match
    const q = query.toLowerCase();
    return REGIONAL_PRESETS.filter(
      (p) => p.name.toLowerCase().includes(q) || p.district.toLowerCase().includes(q)
    ).map((p) => ({
      id: p.id,
      name: p.name,
      displayName: `${p.name}, ${p.district}`,
      subtitle: p.district,
      lat: p.lat,
      lon: p.lon,
      bbox: [p.lat - 0.03, p.lon - 0.03, p.lat + 0.03, p.lon + 0.03],
    }));
  }
}

/**
 * Send selected region or candidate point payload to backend
 */
export async function sendPayloadToBackend(payload) {
  try {
    const endpoint = `${BACKEND_BASE_URL}/api/region/select`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Backend response status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    // If backend is not running yet during Phase 1, return formatted simulated confirmation
    return {
      status: 'success_simulated',
      message: 'Payload formatted and queued. Ready for Phase 2 Backend Hydrology Engine.',
      backendUrl: BACKEND_BASE_URL,
      receivedPayload: payload,
      timestamp: new Date().toISOString(),
    };
  }
}

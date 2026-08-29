/**
 * Geodesic and GIS Helper Utilities
 */

// Earth radius in meters
const EARTH_RADIUS = 6378137;

/**
 * Calculates geodesic area of a polygon defined by lat/lng points in square meters
 * using the spherical excess / Shoelace formula on a sphere
 */
export function calculatePolygonArea(latLngs) {
  if (!latLngs || latLngs.length < 3) return 0;

  const points = latLngs.map((pt) => ({
    lat: Array.isArray(pt) ? pt[0] : (pt.lat || 0),
    lng: Array.isArray(pt) ? pt[1] : (pt.lng || pt.lon || 0),
  }));

  let area = 0;
  const len = points.length;

  for (let i = 0; i < len; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % len];

    const lat1 = (p1.lat * Math.PI) / 180;
    const lat2 = (p2.lat * Math.PI) / 180;
    const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;

    area += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  area = (Math.abs(area) * EARTH_RADIUS * EARTH_RADIUS) / 4;
  return area;
}

/**
 * Calculates area of a bounding box [minLat, minLng, maxLat, maxLng]
 */
export function calculateBBoxArea(bbox) {
  if (!bbox || bbox.length !== 4) return 0;
  const [minLat, minLng, maxLat, maxLng] = bbox;
  const corners = [
    [minLat, minLng],
    [maxLat, minLng],
    [maxLat, maxLng],
    [minLat, maxLng],
  ];
  return calculatePolygonArea(corners);
}

/**
 * Calculates distance between two points in meters (Haversine formula)
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}

/**
 * Calculates perimeter of a list of lat/lng points in meters
 */
export function calculatePerimeter(latLngs) {
  if (!latLngs || latLngs.length < 2) return 0;
  let totalDistance = 0;
  for (let i = 0; i < latLngs.length; i++) {
    const p1 = latLngs[i];
    const p2 = latLngs[(i + 1) % latLngs.length];
    const lat1 = Array.isArray(p1) ? p1[0] : p1.lat;
    const lon1 = Array.isArray(p1) ? p1[1] : (p1.lng || p1.lon);
    const lat2 = Array.isArray(p2) ? p2[0] : p2.lat;
    const lon2 = Array.isArray(p2) ? p2[1] : (p2.lng || p2.lon);
    totalDistance += calculateDistance(lat1, lon1, lat2, lon2);
  }
  return totalDistance;
}

/**
 * Format area into human readable units (m², ha, km², acres)
 */
export function formatArea(sqMeters) {
  if (sqMeters <= 0) return { primary: '0 m²', hectares: '0.00 ha', acres: '0.00 acres', km2: '0.00 km²' };

  const hectares = sqMeters / 10000;
  const acres = sqMeters * 0.000247105;
  const km2 = sqMeters / 1000000;

  let primary = '';
  if (sqMeters < 10000) {
    primary = `${Math.round(sqMeters).toLocaleString()} m²`;
  } else if (sqMeters < 1000000) {
    primary = `${hectares.toFixed(2)} ha`;
  } else {
    primary = `${km2.toFixed(3)} km²`;
  }

  return {
    primary,
    rawMeters: Math.round(sqMeters),
    hectares: `${hectares.toFixed(2)} ha`,
    acres: `${acres.toFixed(2)} acres`,
    km2: `${km2.toFixed(3)} km²`,
  };
}

/**
 * Formats decimal degrees to DMS (Degrees, Minutes, Seconds)
 */
export function toDMS(deg, isLat) {
  const absolute = Math.abs(deg);
  const degrees = Math.floor(absolute);
  const minutesNotTruncated = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(1);

  const direction = isLat
    ? deg >= 0 ? 'N' : 'S'
    : deg >= 0 ? 'E' : 'W';

  return `${degrees}°${minutes}'${seconds}" ${direction}`;
}

/**
 * Generate standard GeoJSON Feature from selection
 */
export function generateGeoJSON(selection) {
  if (!selection) return null;

  if (selection.type === 'bbox') {
    const [minLat, minLng, maxLat, maxLng] = selection.bbox;
    return {
      type: 'Feature',
      properties: {
        name: selection.name || 'Selected Bounding Box',
        selectionType: 'bbox',
        areaHectares: selection.areaHectares || 0,
        createdAt: new Date().toISOString(),
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [minLng, minLat],
            [minLng, maxLat],
            [maxLng, maxLat],
            [maxLng, minLat],
            [minLng, minLat],
          ],
        ],
      },
    };
  }

  if (selection.type === 'polygon') {
    const coords = selection.points.map((pt) => [
      Array.isArray(pt) ? pt[1] : (pt.lng || pt.lon),
      Array.isArray(pt) ? pt[0] : pt.lat,
    ]);
    // Close the loop
    if (coords.length > 0) {
      coords.push([...coords[0]]);
    }

    return {
      type: 'Feature',
      properties: {
        name: selection.name || 'Selected Area Polygon',
        selectionType: 'polygon',
        areaHectares: selection.areaHectares || 0,
        createdAt: new Date().toISOString(),
      },
      geometry: {
        type: 'Polygon',
        coordinates: [coords],
      },
    };
  }

  if (selection.type === 'point') {
    return {
      type: 'Feature',
      properties: {
        name: selection.name || 'Selected Pond Candidate Point',
        selectionType: 'point',
        createdAt: new Date().toISOString(),
      },
      geometry: {
        type: 'Point',
        coordinates: [selection.lon, selection.lat],
      },
    };
  }

  return null;
}

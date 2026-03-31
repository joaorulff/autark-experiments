import type { Feature, Polygon, MultiPolygon, Position } from 'geojson';
import type { SubwayStation } from './subway';

const RADIUS_METERS = 500;

/**
 * Count how many subway stations are within RADIUS_METERS of a building's centroid.
 */
export function countStationsNearBuilding(
  feature: Feature<Polygon | MultiPolygon>,
  stations: SubwayStation[]
): number {
  const centroid = computeCentroid(feature.geometry);
  if (!centroid) return 0;

  let count = 0;
  for (const s of stations) {
    const d = haversineDistance(centroid[1], centroid[0], s.latitude, s.longitude);
    if (d <= RADIUS_METERS) {
      count++;
    }
  }
  return count;
}

function computeCentroid(geometry: Polygon | MultiPolygon): [number, number] | null {
  let coords: Position[];

  if (geometry.type === 'Polygon') {
    coords = geometry.coordinates[0];
  } else {
    // MultiPolygon — use all outer rings
    coords = geometry.coordinates.flatMap((poly) => poly[0]);
  }

  if (coords.length === 0) return null;

  let sumLng = 0;
  let sumLat = 0;
  for (const c of coords) {
    sumLng += c[0];
    sumLat += c[1];
  }
  return [sumLng / coords.length, sumLat / coords.length];
}

/**
 * Haversine distance in meters between two lat/lng points.
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

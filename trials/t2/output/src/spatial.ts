import type { FeatureCollection, Feature, Position } from 'geojson';
import type { SubwayStation } from './types';

const R_EARTH = 6_371_000; // metres

/** Haversine distance between two lat/lon points in metres. */
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R_EARTH * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Compute the centroid (mean of vertices) for a polygon/multipolygon feature. Returns [lon, lat]. */
function featureCentroid(f: Feature): [number, number] | null {
  let coords: Position[];
  if (f.geometry.type === 'Polygon') {
    coords = f.geometry.coordinates[0];
  } else if (f.geometry.type === 'MultiPolygon') {
    coords = f.geometry.coordinates[0][0];
  } else {
    return null;
  }
  if (!coords || coords.length === 0) return null;
  let sumLon = 0, sumLat = 0;
  for (const c of coords) {
    sumLon += c[0];
    sumLat += c[1];
  }
  return [sumLon / coords.length, sumLat / coords.length];
}

/**
 * For each building feature, count subway stations within `radiusM` metres
 * and attach a `subwayCount` property.
 */
export function computeBuildingProximity(
  buildings: FeatureCollection,
  stations: SubwayStation[],
  radiusM = 500,
): FeatureCollection {
  console.log(`[Spatial] Computing subway proximity for ${buildings.features.length} buildings, ${stations.length} stations, radius=${radiusM}m`);
  const t0 = performance.now();

  let matched = 0;
  for (const f of buildings.features) {
    const c = featureCentroid(f);
    if (!c) {
      f.properties = { ...f.properties, subwayCount: 0 };
      continue;
    }
    const [lon, lat] = c;
    let count = 0;
    for (const s of stations) {
      if (haversineDistance(lat, lon, s.latitude, s.longitude) <= radiusM) {
        count++;
      }
    }
    f.properties = { ...f.properties, subwayCount: count };
    if (count > 0) matched++;
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`[Spatial] Proximity complete in ${elapsed}s — ${matched}/${buildings.features.length} buildings have ≥1 station nearby`);
  return buildings;
}

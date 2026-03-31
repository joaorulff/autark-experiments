import type { RoadCollection } from '../data/types';

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS = 6371000; // meters

function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}

export function cpuCalculateLengths(roads: RoadCollection): Float32Array {
  console.log(`CPU length calculation for ${roads.features.length} road segments...`);
  const t0 = performance.now();

  const lengths = new Float32Array(roads.features.length);

  for (let i = 0; i < roads.features.length; i++) {
    const coords = roads.features[i].geometry.coordinates;
    let total = 0;
    for (let j = 0; j < coords.length - 1; j++) {
      total += haversine(coords[j][0], coords[j][1], coords[j + 1][0], coords[j + 1][1]);
    }
    lengths[i] = total;
  }

  const elapsed = (performance.now() - t0).toFixed(1);
  console.log(`CPU length calculation complete in ${elapsed}ms`);
  return lengths;
}

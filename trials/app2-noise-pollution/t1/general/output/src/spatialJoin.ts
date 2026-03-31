/**
 * Spatial join: for each building, count noise events within 500m of its centroid.
 * Uses a simple grid-based spatial index for performance.
 */

import type { FeatureCollection, Polygon } from 'geojson';
import type { NoisePoint } from './noiseLoader';

const RADIUS_M = 500;

// Approximate degree-to-meter conversions at Manhattan's latitude (~40.78)
const LAT_DEG_TO_M = 111320;
const LON_DEG_TO_M = 111320 * Math.cos((40.78 * Math.PI) / 180); // ~84400

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  // Fast approximation using equirectangular projection (accurate enough for 500m at this latitude)
  const dy = (lat2 - lat1) * LAT_DEG_TO_M;
  const dx = (lon2 - lon1) * LON_DEG_TO_M;
  return Math.sqrt(dx * dx + dy * dy);
}

interface GridCell {
  points: NoisePoint[];
}

export function computeNoiseCounts(
  buildings: FeatureCollection<Polygon>,
  noisePoints: NoisePoint[]
): Map<number, number> {
  console.log('[SpatialJoin] Starting spatial join...');
  console.log(`[SpatialJoin] ${buildings.features.length} buildings, ${noisePoints.length} noise points`);

  // Build grid index for noise points
  const cellSizeDeg = RADIUS_M / LAT_DEG_TO_M; // ~0.0045 degrees
  const grid = new Map<string, GridCell>();

  for (const p of noisePoints) {
    const cx = Math.floor(p.lon / cellSizeDeg);
    const cy = Math.floor(p.lat / cellSizeDeg);
    const key = `${cx},${cy}`;
    if (!grid.has(key)) grid.set(key, { points: [] });
    grid.get(key)!.points.push(p);
  }

  console.log(`[SpatialJoin] Grid index built: ${grid.size} cells`);

  const counts = new Map<number, number>();
  const searchRadius = Math.ceil(RADIUS_M / (cellSizeDeg * LAT_DEG_TO_M)) + 1;

  for (let i = 0; i < buildings.features.length; i++) {
    const feature = buildings.features[i];
    const coords = feature.geometry.coordinates[0];

    // Compute centroid
    let cx = 0, cy = 0;
    const n = coords.length - 1; // last point = first point for closed polygon
    for (let j = 0; j < n; j++) {
      cx += coords[j][0];
      cy += coords[j][1];
    }
    cx /= n;
    cy /= n;

    // Search nearby grid cells
    const gcx = Math.floor(cx / cellSizeDeg);
    const gcy = Math.floor(cy / cellSizeDeg);
    let count = 0;

    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      for (let dy = -searchRadius; dy <= searchRadius; dy++) {
        const cell = grid.get(`${gcx + dx},${gcy + dy}`);
        if (!cell) continue;
        for (const p of cell.points) {
          if (haversineDistance(cy, cx, p.lat, p.lon) <= RADIUS_M) {
            count++;
          }
        }
      }
    }

    counts.set(i, count);

    if ((i + 1) % 5000 === 0) {
      console.log(`[SpatialJoin] Processed ${i + 1}/${buildings.features.length} buildings`);
    }
  }

  // Stats
  let maxCount = 0, withNoise = 0;
  for (const c of counts.values()) {
    if (c > maxCount) maxCount = c;
    if (c > 0) withNoise++;
  }

  console.log(`[SpatialJoin] Spatial join complete: ${withNoise} buildings with noise nearby, max count: ${maxCount}`);
  return counts;
}

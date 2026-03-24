/**
 * Spatial join: count noise events within 500m of each building centroid.
 * Uses a grid-based spatial index for performance.
 */

import * as turf from '@turf/turf';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import type { NoiseRecord, BuildingProperties } from './types';

const RADIUS_KM = 0.5; // 500 meters

function setStatus(msg: string) {
  const el = document.getElementById('loading-status');
  if (el) el.textContent = msg;
}

/** Build a grid index for noise points for fast radius queries */
function buildGridIndex(noiseRecords: NoiseRecord[], cellSizeKm: number): Map<string, NoiseRecord[]> {
  const grid = new Map<string, NoiseRecord[]>();
  // Approximate degrees per km at Manhattan latitude (~40.78)
  const degPerKmLat = 1 / 111.32;
  const degPerKmLon = 1 / (111.32 * Math.cos(40.78 * Math.PI / 180));
  const cellLat = cellSizeKm * degPerKmLat;
  const cellLon = cellSizeKm * degPerKmLon;

  for (const rec of noiseRecords) {
    const cellX = Math.floor(rec.longitude / cellLon);
    const cellY = Math.floor(rec.latitude / cellLat);
    const key = `${cellX},${cellY}`;
    let arr = grid.get(key);
    if (!arr) {
      arr = [];
      grid.set(key, arr);
    }
    arr.push(rec);
  }

  return grid;
}

function getNearbyCells(lon: number, lat: number, cellSizeKm: number): string[] {
  const degPerKmLat = 1 / 111.32;
  const degPerKmLon = 1 / (111.32 * Math.cos(40.78 * Math.PI / 180));
  const cellLat = cellSizeKm * degPerKmLat;
  const cellLon = cellSizeKm * degPerKmLon;

  const cellX = Math.floor(lon / cellLon);
  const cellY = Math.floor(lat / cellLat);

  const keys: string[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      keys.push(`${cellX + dx},${cellY + dy}`);
    }
  }
  return keys;
}

export function performSpatialJoin(
  buildings: FeatureCollection<Polygon | MultiPolygon>,
  noiseRecords: NoiseRecord[]
): void {
  console.log('Spatial join started...');
  setStatus(`Performing spatial join: ${buildings.features.length} buildings × ${noiseRecords.length} noise events...`);

  const cellSizeKm = 1; // 1km cells (bigger than 500m radius so neighbors cover it)
  const grid = buildGridIndex(noiseRecords, cellSizeKm);
  console.log(`Grid index built: ${grid.size} cells`);

  let matched = 0;
  const totalBuildings = buildings.features.length;

  for (let i = 0; i < totalBuildings; i++) {
    const feature = buildings.features[i];
    const props = feature.properties as BuildingProperties;

    // Compute centroid
    let centroid: [number, number];
    try {
      const c = turf.centroid(feature as any);
      centroid = c.geometry.coordinates as [number, number];
    } catch {
      props.noiseCount = 0;
      props.area = 0;
      continue;
    }

    // Compute area in sq meters
    try {
      props.area = turf.area(feature as any);
    } catch {
      props.area = 0;
    }

    // Count noise events within 500m using grid index
    let count = 0;
    const cellKeys = getNearbyCells(centroid[0], centroid[1], cellSizeKm);

    for (const key of cellKeys) {
      const cell = grid.get(key);
      if (!cell) continue;
      for (const rec of cell) {
        const dist = turf.distance(
          turf.point(centroid),
          turf.point([rec.longitude, rec.latitude]),
          { units: 'kilometers' }
        );
        if (dist <= RADIUS_KM) {
          count++;
        }
      }
    }

    props.noiseCount = count;
    props.id = i;
    if (count > 0) matched++;

    if ((i + 1) % 2000 === 0) {
      console.log(`Spatial join progress: ${i + 1}/${totalBuildings} buildings processed`);
    }
  }

  console.log(`Spatial join complete: ${matched} buildings matched with at least one noise event`);
  setStatus('Spatial join complete. Rendering...');
}

export function getMaxNoiseCount(buildings: FeatureCollection<Polygon | MultiPolygon>): number {
  let max = 0;
  for (const f of buildings.features) {
    const count = (f.properties as BuildingProperties).noiseCount || 0;
    if (count > max) max = count;
  }
  return max;
}

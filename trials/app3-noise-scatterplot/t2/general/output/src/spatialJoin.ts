import type { Feature, Polygon, MultiPolygon, Position } from 'geojson';
import type { NoiseRecord, BuildingFeature, BuildingProperties } from './types';

const RADIUS_METERS = 500;

/**
 * Haversine distance in meters between two [lon, lat] points.
 */
function haversineDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Compute centroid of a polygon ring.
 */
function computeCentroid(coords: Position[][]): [number, number] {
  let sumLon = 0;
  let sumLat = 0;
  let count = 0;
  for (const ring of coords) {
    for (const [lon, lat] of ring) {
      sumLon += lon;
      sumLat += lat;
      count++;
    }
  }
  return [sumLon / count, sumLat / count];
}

/**
 * Approximate polygon area in square meters using the shoelace formula on projected coords.
 */
function computeArea(coords: Position[][]): number {
  const ring = coords[0];
  if (!ring || ring.length < 4) return 0;

  // Project to approximate meters using the centroid latitude
  const centroidLat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos((centroidLat * Math.PI) / 180);

  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = ring[i][0] * metersPerDegLon;
    const y1 = ring[i][1] * metersPerDegLat;
    const x2 = ring[i + 1][0] * metersPerDegLon;
    const y2 = ring[i + 1][1] * metersPerDegLat;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

/**
 * Build a spatial grid index for noise records to speed up spatial join.
 */
function buildGrid(records: NoiseRecord[], cellSizeDeg: number): Map<string, NoiseRecord[]> {
  const grid = new Map<string, NoiseRecord[]>();
  for (const r of records) {
    const key = `${Math.floor(r.latitude / cellSizeDeg)}_${Math.floor(r.longitude / cellSizeDeg)}`;
    const cell = grid.get(key);
    if (cell) {
      cell.push(r);
    } else {
      grid.set(key, [r]);
    }
  }
  return grid;
}

export function spatialJoinNoiseToBuildings(
  buildings: Feature[],
  noiseRecords: NoiseRecord[]
): BuildingFeature[] {
  console.log(`Spatial join started: ${buildings.length} buildings, ${noiseRecords.length} noise records`);

  // ~0.005 degrees is roughly 500m
  const cellSize = 0.005;
  const grid = buildGrid(noiseRecords, cellSize);
  const searchRadius = Math.ceil(RADIUS_METERS / (cellSize * 111320)) + 1;

  const result: BuildingFeature[] = [];
  let matchedCount = 0;

  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];
    const geom = building.geometry;

    let centroid: [number, number];
    let area: number;

    if (geom.type === 'Polygon') {
      centroid = computeCentroid((geom as Polygon).coordinates);
      area = computeArea((geom as Polygon).coordinates);
    } else if (geom.type === 'MultiPolygon') {
      centroid = computeCentroid((geom as MultiPolygon).coordinates[0]);
      area = (geom as MultiPolygon).coordinates.reduce((s, c) => s + computeArea(c), 0);
    } else {
      continue;
    }

    const [bLon, bLat] = centroid;
    const cellY = Math.floor(bLat / cellSize);
    const cellX = Math.floor(bLon / cellSize);

    let noiseCount = 0;
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        const key = `${cellY + dy}_${cellX + dx}`;
        const cell = grid.get(key);
        if (!cell) continue;
        for (const r of cell) {
          if (haversineDistance(bLon, bLat, r.longitude, r.latitude) <= RADIUS_METERS) {
            noiseCount++;
          }
        }
      }
    }

    if (noiseCount > 0) matchedCount++;

    const props: BuildingProperties = {
      ...((building.properties || {}) as Record<string, unknown>),
      id: i,
      noiseCount,
      area: Math.round(area),
      selected: false,
      highlighted: false,
    };

    result.push({
      type: 'Feature',
      geometry: building.geometry,
      properties: props,
    });
  }

  console.log(`Spatial join complete: ${matchedCount} buildings matched with noise data`);
  return result;
}

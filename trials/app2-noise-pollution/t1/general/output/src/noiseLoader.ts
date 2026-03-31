/**
 * Loads and parses the noise CSV file, filtering to Manhattan entries with valid coordinates.
 */

import Papa from 'papaparse';

export interface NoisePoint {
  lat: number;
  lon: number;
  complaintType: string;
  descriptor: string;
  createdDate: string;
}

export async function loadNoiseData(url: string): Promise<NoisePoint[]> {
  console.log('[Noise] Loading noise CSV...');

  const resp = await fetch(url);
  const text = await resp.text();
  console.log(`[Noise] CSV fetched: ${(text.length / 1024).toFixed(1)} KB`);

  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  console.log(`[Noise] Parsed ${result.data.length} rows`);

  // Manhattan bounding box (approximate)
  const MANHATTAN_BOUNDS = {
    minLat: 40.700,
    maxLat: 40.882,
    minLon: -74.020,
    maxLon: -73.907,
  };

  const points: NoisePoint[] = [];
  for (const row of result.data as Record<string, string>[]) {
    const lat = parseFloat(row['Latitude']);
    const lon = parseFloat(row['Longitude']);

    if (isNaN(lat) || isNaN(lon)) continue;

    // Filter to Manhattan area
    if (lat < MANHATTAN_BOUNDS.minLat || lat > MANHATTAN_BOUNDS.maxLat) continue;
    if (lon < MANHATTAN_BOUNDS.minLon || lon > MANHATTAN_BOUNDS.maxLon) continue;

    points.push({
      lat,
      lon,
      complaintType: row['Complaint Type'] || '',
      descriptor: row['Descriptor'] || '',
      createdDate: row['Created Date'] || '',
    });
  }

  console.log(`[Noise] ${points.length} noise points in Manhattan area`);
  return points;
}

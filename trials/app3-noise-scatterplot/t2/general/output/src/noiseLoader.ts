import Papa from 'papaparse';
import type { NoiseRecord } from './types';

// Manhattan approximate bounding box
const MANHATTAN_BOUNDS = {
  minLat: 40.698,
  maxLat: 40.882,
  minLon: -74.024,
  maxLon: -73.907,
};

export async function loadNoiseData(): Promise<NoiseRecord[]> {
  console.log('Loading noise data from CSV...');

  const response = await fetch('/noise.csv');
  const text = await response.text();

  return new Promise((resolve) => {
    const records: NoiseRecord[] = [];

    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        for (const row of results.data as Record<string, string>[]) {
          const lat = parseFloat(row['Latitude']);
          const lon = parseFloat(row['Longitude']);
          if (
            !isNaN(lat) &&
            !isNaN(lon) &&
            lat >= MANHATTAN_BOUNDS.minLat &&
            lat <= MANHATTAN_BOUNDS.maxLat &&
            lon >= MANHATTAN_BOUNDS.minLon &&
            lon <= MANHATTAN_BOUNDS.maxLon
          ) {
            records.push({
              latitude: lat,
              longitude: lon,
              complaintType: row['Complaint Type'] || '',
              descriptor: row['Descriptor'] || '',
            });
          }
        }
        console.log(`Noise data loaded: ${records.length} Manhattan records (filtered from ${results.data.length} total)`);
        resolve(records);
      },
    });
  });
}

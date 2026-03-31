/**
 * Load and process noise complaint data from CSV.
 */

import Papa from 'papaparse';
import type { NoiseRecord } from './types';

export async function loadNoiseData(): Promise<NoiseRecord[]> {
  console.log('Loading noise data from CSV...');

  const response = await fetch('/noise.csv');
  const text = await response.text();

  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const records: NoiseRecord[] = [];
        for (const row of results.data as any[]) {
          const lat = parseFloat(row['Latitude']);
          const lon = parseFloat(row['Longitude']);
          if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
            records.push({
              latitude: lat,
              longitude: lon,
              complaintType: row['Complaint Type'] || '',
              descriptor: row['Descriptor'] || '',
              createdDate: row['Created Date'] || '',
            });
          }
        }
        console.log(`Noise data loaded: ${records.length} valid records out of ${results.data.length} rows`);
        resolve(records);
      },
      error: (err: Error) => {
        console.error('Error parsing noise CSV:', err);
        reject(err);
      },
    });
  });
}

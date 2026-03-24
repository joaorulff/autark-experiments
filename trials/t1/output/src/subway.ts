import Papa from 'papaparse';

export interface SubwayStation {
  key: number;
  latitude: number;
  longitude: number;
}

export async function loadSubwayStations(url: string): Promise<SubwayStation[]> {
  const response = await fetch(url);
  const text = await response.text();

  return new Promise((resolve, reject) => {
    Papa.parse<{ key: string; latitude: string; longitude: string }>(text, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const stations: SubwayStation[] = results.data.map((row) => ({
          key: parseInt(row.key, 10),
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
        }));
        resolve(stations);
      },
      error(err: Error) {
        reject(err);
      },
    });
  });
}

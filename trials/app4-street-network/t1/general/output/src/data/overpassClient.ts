const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Fetches all Manhattan Island OSM data in a single Overpass query:
 * roads, parks, water, and surface (landuse) polygons.
 */
export async function fetchManhattanOsmData(): Promise<unknown> {
  console.log('Fetching Overpass API data for Manhattan Island...');

  // Single combined query using the "Manhattan Island" named area
  const query = `
[out:json][timeout:120][maxsize:67108864];
area["name"="Manhattan Island"]->.manhattan;
(
  way["highway"](area.manhattan);
  way["leisure"="park"](area.manhattan);
  relation["leisure"="park"](area.manhattan);
  way["natural"="water"](area.manhattan);
  relation["natural"="water"](area.manhattan);
  way["landuse"](area.manhattan);
  relation["landuse"](area.manhattan);
);
out body;
>;
out skel qt;
`;

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Overpass API request attempt ${attempt}/${maxRetries}`);
      const response = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (response.status === 429) {
        const wait = Math.pow(2, attempt) * 2000;
        console.warn(`Overpass API rate limit (429). Retrying in ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const sizeKB = Math.round(JSON.stringify(data).length / 1024);
      console.log(`Overpass response received: ~${sizeKB} KB, ${data.elements?.length ?? 0} elements`);
      return data;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const wait = Math.pow(2, attempt) * 2000;
      console.warn(`Overpass request failed: ${err}. Retrying in ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  throw new Error('Overpass API: all retries exhausted');
}

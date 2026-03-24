/**
 * Overpass API queries for Manhattan Island OSM data.
 * All queries use area:name="Manhattan Island" to restrict to the island boundary.
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

async function queryOverpass(query: string, label: string): Promise<any> {
  console.log(`[Overpass] Fetching ${label}...`);
  const body = `data=${encodeURIComponent(query)}`;

  let attempt = 0;
  const maxAttempts = 4;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const resp = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      if (resp.status === 429) {
        const wait = Math.pow(2, attempt) * 2000;
        console.warn(`[Overpass] 429 Too Many Requests for ${label}. Waiting ${wait}ms (attempt ${attempt}/${maxAttempts})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }

      const data = await resp.json();
      console.log(`[Overpass] ${label} received: ${data.elements?.length ?? 0} elements`);
      return data;
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      const wait = Math.pow(2, attempt) * 1000;
      console.warn(`[Overpass] Error for ${label}: ${err}. Retrying in ${wait}ms...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

/**
 * Single combined query for all Manhattan layers.
 * Returns buildings, parks, water, roads, and the island boundary in one request.
 */
export async function fetchAllManhattanData(): Promise<any> {
  // Single combined query to minimize API calls
  const query = `
[out:json][timeout:120];
area["name"="Manhattan Island"]->.manhattan;

(
  // Buildings
  way["building"](area.manhattan);
  relation["building"](area.manhattan);

  // Parks and green spaces
  way["leisure"="park"](area.manhattan);
  relation["leisure"="park"](area.manhattan);
  way["landuse"="grass"](area.manhattan);

  // Water bodies
  way["natural"="water"](area.manhattan);
  relation["natural"="water"](area.manhattan);
  way["waterway"](area.manhattan);

  // Roads
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service|unclassified)$"](area.manhattan);
);

out body;
>;
out skel qt;
`;

  return queryOverpass(query, 'all Manhattan layers');
}

export async function fetchManhattanBoundary(): Promise<any> {
  const query = `
[out:json][timeout:30];
relation["name"="Manhattan Island"]["type"="boundary"];
out body;
>;
out skel qt;
`;
  return queryOverpass(query, 'Manhattan boundary');
}

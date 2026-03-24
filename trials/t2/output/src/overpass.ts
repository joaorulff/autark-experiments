import osmtogeojson from 'osmtogeojson';
import type { FeatureCollection, Feature } from 'geojson';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Fetch from the Overpass API with retry + exponential backoff.
 */
export async function fetchOverpass(query: string, retries = 3): Promise<unknown> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`[Overpass] Request attempt ${attempt}/${retries}…`);
    try {
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (res.status === 429) {
        const wait = Math.pow(2, attempt) * 5000;
        console.warn(`[Overpass] 429 Too Many Requests — waiting ${wait / 1000}s before retry`);
        await delay(wait);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      }

      const json = await res.json();
      const size = JSON.stringify(json).length;
      console.log(`[Overpass] Response received: ${(size / 1024 / 1024).toFixed(2)} MB, ${json.elements?.length ?? 0} elements`);
      return json;
    } catch (err) {
      console.error(`[Overpass] Attempt ${attempt} failed:`, err);
      if (attempt === retries) throw err;
      await delay(Math.pow(2, attempt) * 3000);
    }
  }
  throw new Error('Overpass: all retries exhausted');
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toGeoJSON(data: unknown): FeatureCollection {
  const fc = osmtogeojson(data);
  console.log(`[Overpass] Converted to GeoJSON: ${fc.features.length} features`);
  return fc;
}

function filterByGeometryType(fc: FeatureCollection, types: string[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.filter((f) => types.includes(f.geometry.type)),
  };
}

function filterByTag(fc: FeatureCollection, predicate: (props: Record<string, unknown>) => boolean): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.filter((f) => predicate((f.properties ?? {}) as Record<string, unknown>)),
  };
}

// ---------- Area resolution ----------

/**
 * Try to resolve the Overpass area for "Manhattan Island".
 * Falls back to "Manhattan" if needed, then to a hard-coded bbox.
 */
async function resolveAreaClause(): Promise<string> {
  // Try "Manhattan Island" first (as instructed)
  const areaNames = ['Manhattan Island', 'Manhattan'];
  for (const name of areaNames) {
    console.log(`[Overpass] Testing area name "${name}"…`);
    const testQuery = `[out:json][timeout:15];area["name"="${name}"]->.a;node(area.a)(1);out count;`;
    try {
      const data = (await fetchOverpass(testQuery, 1)) as { elements: { tags?: { total?: string } }[] };
      const count = parseInt(data.elements?.[0]?.tags?.total ?? '0', 10);
      if (count > 0) {
        console.log(`[Overpass] Area "${name}" resolved (${count} test nodes).`);
        return `area["name"="${name}"]->.a;\n`;
      }
    } catch {
      console.warn(`[Overpass] Area test for "${name}" failed, trying next…`);
    }
    await delay(2000);
  }
  // Hard-coded bbox fallback for Manhattan
  console.warn('[Overpass] Area resolution failed — using bbox fallback.');
  return ''; // queries will use bbox instead
}

const MANHATTAN_BBOX = '40.6996,-74.0201,40.8821,-73.9069';

function bboxFilter(areaClause: string): string {
  return areaClause ? '(area.a)' : `(${MANHATTAN_BBOX})`;
}

// ---------- Public fetchers ----------

let cachedAreaClause: string | null = null;

async function getAreaClause(): Promise<string> {
  if (cachedAreaClause === null) {
    cachedAreaClause = await resolveAreaClause();
  }
  return cachedAreaClause;
}

export async function fetchManhattanSurface(): Promise<FeatureCollection> {
  console.log('[Overpass] Fetching Manhattan surface boundary…');
  const query = `[out:json][timeout:60];
(
  relation["name"="Manhattan Island"]["place"="island"];
  relation["name"="Manhattan Island"]["type"="multipolygon"];
  relation["name"="Manhattan"]["place"="island"];
  relation["name"="Manhattan"]["boundary"]["admin_level"];
);
out body;>;out skel qt;`;
  const data = await fetchOverpass(query);
  const fc = toGeoJSON(data);
  const polys = filterByGeometryType(fc, ['Polygon', 'MultiPolygon']);
  console.log(`[Overpass] Surface: ${polys.features.length} polygon(s)`);
  return polys;
}

export async function fetchParksAndWater(): Promise<{ parks: FeatureCollection; water: FeatureCollection }> {
  const ac = await getAreaClause();
  const bf = bboxFilter(ac);
  console.log('[Overpass] Fetching parks and water…');
  const query = `[out:json][timeout:90];
${ac}(
  way["leisure"="park"]${bf};
  relation["leisure"="park"]${bf};
  way["natural"="water"]${bf};
  relation["natural"="water"]${bf};
  way["waterway"]${bf};
  relation["waterway"]${bf};
);
out body;>;out skel qt;`;
  const data = await fetchOverpass(query);
  const fc = toGeoJSON(data);

  const parks = filterByTag(fc, (p) => p['leisure'] === 'park');
  const water = filterByTag(fc, (p) => p['natural'] === 'water' || !!p['waterway']);

  console.log(`[Overpass] Parks: ${parks.features.length}, Water: ${water.features.length}`);
  return { parks, water };
}

export async function fetchRoads(): Promise<FeatureCollection> {
  const ac = await getAreaClause();
  const bf = bboxFilter(ac);
  console.log('[Overpass] Fetching roads…');
  const query = `[out:json][timeout:90];
${ac}(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service)$"]${bf};
);
out body;>;out skel qt;`;
  const data = await fetchOverpass(query);
  const fc = toGeoJSON(data);
  const lines = filterByGeometryType(fc, ['LineString', 'MultiLineString']);
  console.log(`[Overpass] Roads: ${lines.features.length} linestrings`);
  return lines;
}

export async function fetchBuildings(): Promise<FeatureCollection> {
  const ac = await getAreaClause();
  const bf = bboxFilter(ac);
  console.log('[Overpass] Fetching buildings (this may take a while)…');
  const query = `[out:json][timeout:180][maxsize:268435456];
${ac}(
  way["building"]${bf};
  relation["building"]${bf};
);
out body;>;out skel qt;`;
  const data = await fetchOverpass(query);
  const fc = toGeoJSON(data);
  const polys = filterByGeometryType(fc, ['Polygon', 'MultiPolygon']);
  console.log(`[Overpass] Buildings: ${polys.features.length} polygons`);
  return polys;
}

/**
 * Assign a sequential numeric `id` to each feature so MapLibre can track feature state.
 */
export function assignFeatureIds(fc: FeatureCollection): FeatureCollection {
  fc.features.forEach((f: Feature, i: number) => {
    f.id = i;
  });
  return fc;
}

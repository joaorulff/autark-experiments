// Overpass API querying for Manhattan Island OSM data

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export interface GeoFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon' | 'LineString' | 'MultiLineString' | 'Point';
    coordinates: number[][] | number[][][] | number[][][][];
  };
  properties: Record<string, string | number | undefined>;
  id?: string;
}

export interface GeoCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

async function queryOverpass(query: string): Promise<unknown> {
  console.log('Fetching Overpass API...');
  const resp = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
  });
  if (resp.status === 429) {
    console.warn('Overpass 429 rate limit — waiting 30s and retrying...');
    await new Promise(r => setTimeout(r, 30000));
    return queryOverpass(query);
  }
  if (!resp.ok) throw new Error(`Overpass error: ${resp.status}`);
  const data = await resp.json();
  const size = JSON.stringify(data).length;
  console.log(`Overpass response received: ${(size / 1e6).toFixed(2)} MB`);
  return data;
}

// Convert Overpass JSON nodes/ways/relations into GeoJSON
function osmToGeoJSON(data: any): GeoCollection {
  const nodeMap = new Map<number, [number, number]>();
  const features: GeoFeature[] = [];

  for (const el of data.elements) {
    if (el.type === 'node') {
      nodeMap.set(el.id, [el.lon, el.lat]);
    }
  }

  for (const el of data.elements) {
    if (el.type === 'node' && el.tags) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
        properties: el.tags || {},
        id: `node/${el.id}`,
      });
    }
    if (el.type === 'way' && el.nodes) {
      const coords: number[][] = [];
      for (const nid of el.nodes) {
        const c = nodeMap.get(nid);
        if (c) coords.push(c);
      }
      if (coords.length < 2) continue;
      const closed = el.nodes[0] === el.nodes[el.nodes.length - 1] && coords.length >= 4;
      features.push({
        type: 'Feature',
        geometry: closed
          ? { type: 'Polygon', coordinates: [coords] }
          : { type: 'LineString', coordinates: coords },
        properties: el.tags || {},
        id: `way/${el.id}`,
      });
    }
    if (el.type === 'relation' && el.members) {
      // Simple multipolygon assembly for outer members
      const outers: number[][][] = [];
      for (const m of el.members) {
        if (m.type === 'way' && m.role === 'outer' && m.geometry) {
          const ring = m.geometry.map((p: any) => [p.lon, p.lat]);
          if (ring.length >= 4) outers.push(ring);
        }
      }
      if (outers.length > 0) {
        features.push({
          type: 'Feature',
          geometry: outers.length === 1
            ? { type: 'Polygon', coordinates: outers }
            : { type: 'MultiPolygon', coordinates: outers.map(r => [r]) },
          properties: el.tags || {},
          id: `relation/${el.id}`,
        });
      }
    }
  }
  return { type: 'FeatureCollection', features };
}

export async function loadAllLayers(): Promise<{
  surface: GeoCollection;
  parks: GeoCollection;
  water: GeoCollection;
  roads: GeoCollection;
  buildings: GeoCollection;
}> {
  console.log('Loading OSM layers via Overpass...');

  // Single combined query for all layer types to minimize API calls
  const query = `
[out:json][timeout:120];
area["name"="Manhattan Island"]->.mi;

// Surface (land boundary)
(relation["name"="Manhattan Island"]["boundary"="administrative"];);
out body; >; out skel qt;

// Now get all features in the area
(
  // Parks
  way["leisure"="park"](area.mi);
  relation["leisure"="park"](area.mi);
  // Water
  way["natural"="water"](area.mi);
  relation["natural"="water"](area.mi);
  way["waterway"~"river|stream|canal"](area.mi);
  // Roads
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service|unclassified)$"](area.mi);
  // Buildings
  way["building"](area.mi);
  relation["building"](area.mi);
);
out body; >; out skel qt;
`;

  const data: any = await queryOverpass(query);
  const all = osmToGeoJSON(data);

  const surface: GeoFeature[] = [];
  const parks: GeoFeature[] = [];
  const water: GeoFeature[] = [];
  const roads: GeoFeature[] = [];
  const buildings: GeoFeature[] = [];

  for (const f of all.features) {
    const p = f.properties;
    if (p['boundary'] === 'administrative' && (p['name'] === 'Manhattan Island' || p['name'] === 'Manhattan')) {
      surface.push(f);
    } else if (p['leisure'] === 'park') {
      parks.push(f);
    } else if (p['natural'] === 'water' || p['waterway']) {
      water.push(f);
    } else if (p['highway']) {
      roads.push(f);
    } else if (p['building']) {
      buildings.push(f);
    }
  }

  console.log(`OSM surface loaded: ${surface.length} features`);
  console.log(`OSM parks loaded: ${parks.length} features`);
  console.log(`OSM water loaded: ${water.length} features`);
  console.log(`OSM roads loaded: ${roads.length} features`);
  console.log(`OSM buildings loaded: ${buildings.length} features`);

  return {
    surface: { type: 'FeatureCollection', features: surface },
    parks: { type: 'FeatureCollection', features: parks },
    water: { type: 'FeatureCollection', features: water },
    roads: { type: 'FeatureCollection', features: roads },
    buildings: { type: 'FeatureCollection', features: buildings },
  };
}

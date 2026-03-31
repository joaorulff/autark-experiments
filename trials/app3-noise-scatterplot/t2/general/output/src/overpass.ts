import type { Feature } from 'geojson';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

interface GeomPoint {
  lat: number;
  lon: number;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: GeomPoint[];
  members?: Array<{
    type: string;
    role: string;
    geometry?: GeomPoint[];
  }>;
}

/**
 * Convert Overpass JSON `out geom` elements to GeoJSON features.
 */
function elementsToGeoJSON(elements: OverpassElement[]): Feature[] {
  const features: Feature[] = [];

  for (const el of elements) {
    if (el.type === 'way' && el.geometry) {
      const coords: [number, number][] = el.geometry.map((g) => [g.lon, g.lat]);
      if (coords.length < 2) continue;

      const isClosed =
        coords.length >= 4 &&
        coords[0][0] === coords[coords.length - 1][0] &&
        coords[0][1] === coords[coords.length - 1][1];

      features.push({
        type: 'Feature',
        properties: el.tags || {},
        geometry: isClosed
          ? { type: 'Polygon', coordinates: [coords] }
          : { type: 'LineString', coordinates: coords },
      });
    } else if (el.type === 'relation' && el.members) {
      const outerRings: [number, number][][] = [];
      for (const member of el.members) {
        if (member.type === 'way' && member.role === 'outer' && member.geometry) {
          const ring = member.geometry.map((g) => [g.lon, g.lat] as [number, number]);
          if (ring.length >= 4) outerRings.push(ring);
        }
      }
      if (outerRings.length > 0) {
        features.push({
          type: 'Feature',
          properties: el.tags || {},
          geometry:
            outerRings.length === 1
              ? { type: 'Polygon', coordinates: [outerRings[0]] }
              : { type: 'MultiPolygon', coordinates: outerRings.map((r) => [r]) },
        });
      }
    }
  }

  return features;
}

async function queryOverpass(query: string): Promise<OverpassElement[]> {
  console.log('Fetching Overpass API...');
  console.log('Query:', query.substring(0, 200) + '...');

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (response.status === 429) {
    console.warn('Overpass API rate limited (429). Waiting 30s before retry...');
    await new Promise((r) => setTimeout(r, 30000));
    return queryOverpass(query);
  }

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const size = JSON.stringify(data).length;
  console.log(`Overpass response received: ${(size / 1024 / 1024).toFixed(2)} MB, ${data.elements.length} elements`);
  return data.elements;
}

export async function loadOSMLayers(): Promise<{
  surface: Feature[];
  parks: Feature[];
  water: Feature[];
  roads: Feature[];
  buildings: Feature[];
}> {
  console.log('Loading OSM layers...');

  // Single combined query using out geom for inline geometry
  const query = `
[out:json][timeout:120];
area["name"="Manhattan Island"]->.manhattan;

(
  relation["place"="island"]["name"="Manhattan Island"];
  way["leisure"="park"](area.manhattan);
  relation["leisure"="park"](area.manhattan);
  way["natural"="water"](area.manhattan);
  relation["natural"="water"](area.manhattan);
  way["waterway"](area.manhattan);
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service)$"](area.manhattan);
  way["building"](area.manhattan);
  relation["building"](area.manhattan);
);
out geom;
`;

  const elements = await queryOverpass(query);

  // Categorize by tags
  const surfaceEls: OverpassElement[] = [];
  const parkEls: OverpassElement[] = [];
  const waterEls: OverpassElement[] = [];
  const roadEls: OverpassElement[] = [];
  const buildingEls: OverpassElement[] = [];

  for (const el of elements) {
    if (el.type === 'node') continue;
    const tags = el.tags || {};
    if (tags['building']) {
      buildingEls.push(el);
    } else if (tags['leisure'] === 'park') {
      parkEls.push(el);
    } else if (tags['natural'] === 'water' || tags['waterway']) {
      waterEls.push(el);
    } else if (tags['highway']) {
      roadEls.push(el);
    } else if (tags['place'] === 'island' || (el.type === 'relation' && tags['name'] === 'Manhattan Island')) {
      surfaceEls.push(el);
    }
  }

  const surface = elementsToGeoJSON(surfaceEls);
  const parks = elementsToGeoJSON(parkEls);
  const water = elementsToGeoJSON(waterEls);
  const roads = elementsToGeoJSON(roadEls);
  const buildings = elementsToGeoJSON(buildingEls);

  console.log(`OSM layers loaded - Surface: ${surface.length}, Parks: ${parks.length}, Water: ${water.length}, Roads: ${roads.length}, Buildings: ${buildings.length}`);

  return { surface, parks, water, roads, buildings };
}

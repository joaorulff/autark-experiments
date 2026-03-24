import type { Feature, Polygon, MultiPolygon } from 'geojson';

// Manhattan bounding box (slightly padded)
const BBOX = '40.700,-74.020,40.880,-73.907';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Fetch Manhattan building footprints from the Overpass API.
 * We request only buildings within the Manhattan bounding box.
 * To keep data manageable we limit to buildings and return geometry in GeoJSON.
 */
export async function fetchManhattanBuildings(): Promise<Feature<Polygon | MultiPolygon>[]> {
  const query = `
    [out:json][timeout:120];
    (
      way["building"](${BBOX});
      relation["building"](${BBOX});
    );
    out body;
    >;
    out skel qt;
  `;

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API returned ${response.status}: ${response.statusText}`);
  }

  const data: OverpassResponse = await response.json();
  return overpassToGeoJSON(data);
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  members?: Array<{ type: string; ref: number; role: string }>;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

function overpassToGeoJSON(data: OverpassResponse): Feature<Polygon | MultiPolygon>[] {
  // Build node lookup
  const nodes = new Map<number, [number, number]>();
  for (const el of data.elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      nodes.set(el.id, [el.lon, el.lat]);
    }
  }

  // Build way lookup (for relation members)
  const ways = new Map<number, OverpassElement>();
  for (const el of data.elements) {
    if (el.type === 'way') {
      ways.set(el.id, el);
    }
  }

  const features: Feature<Polygon | MultiPolygon>[] = [];

  // Process ways
  for (const el of data.elements) {
    if (el.type === 'way' && el.tags?.building && el.nodes) {
      const coords = el.nodes
        .map((nid) => nodes.get(nid))
        .filter((c): c is [number, number] => c !== undefined);

      if (coords.length >= 4) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [coords] },
          properties: extractProperties(el.tags),
        });
      }
    }
  }

  // Process relations (multipolygon buildings)
  for (const el of data.elements) {
    if (el.type === 'relation' && el.tags?.building && el.members) {
      const outerRings: [number, number][][] = [];
      for (const member of el.members) {
        if (member.type === 'way' && member.role === 'outer') {
          const way = ways.get(member.ref);
          if (way?.nodes) {
            const coords = way.nodes
              .map((nid) => nodes.get(nid))
              .filter((c): c is [number, number] => c !== undefined);
            if (coords.length >= 4) {
              outerRings.push(coords);
            }
          }
        }
      }
      if (outerRings.length === 1) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: outerRings },
          properties: extractProperties(el.tags),
        });
      } else if (outerRings.length > 1) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'MultiPolygon',
            coordinates: outerRings.map((ring) => [ring]),
          },
          properties: extractProperties(el.tags),
        });
      }
    }
  }

  return features;
}

function extractProperties(tags: Record<string, string>): Record<string, unknown> {
  const height = parseFloat(tags['height']) || 0;
  const levels = parseInt(tags['building:levels'], 10) || 0;
  return {
    name: tags['name'] || '',
    height: height > 0 ? height : levels > 0 ? levels * 3.5 : 12,
    levels,
    building: tags['building'],
  };
}

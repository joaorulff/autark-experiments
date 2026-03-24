/**
 * OSM data loading via Overpass API.
 * Uses a single combined query to minimize API calls.
 */

import type { FeatureCollection, Polygon, MultiPolygon, LineString, MultiLineString } from 'geojson';
import type { BuildingFeature, LayerFeatureProperties } from './types';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

function setStatus(msg: string) {
  const el = document.getElementById('loading-status');
  if (el) el.textContent = msg;
}

/** Convert Overpass JSON elements to GeoJSON */
function osmToGeoJSON(elements: any[]): {
  buildings: FeatureCollection<Polygon | MultiPolygon>;
  parks: FeatureCollection<Polygon | MultiPolygon>;
  water: FeatureCollection<Polygon | MultiPolygon>;
  roads: FeatureCollection<LineString | MultiLineString>;
  surface: FeatureCollection<Polygon | MultiPolygon>;
} {
  const buildings: any[] = [];
  const parks: any[] = [];
  const water: any[] = [];
  const roads: any[] = [];
  const surface: any[] = [];

  // Build a map of node IDs to coordinates
  const nodeMap = new Map<number, [number, number]>();
  for (const el of elements) {
    if (el.type === 'node') {
      nodeMap.set(el.id, [el.lon, el.lat]);
    }
  }

  // Build a map of way IDs to coordinate arrays (for relations)
  const wayMap = new Map<number, [number, number][]>();

  let idCounter = 0;

  for (const el of elements) {
    if (el.type === 'way' && el.nodes) {
      const coords: [number, number][] = [];
      for (const nid of el.nodes) {
        const c = nodeMap.get(nid);
        if (c) coords.push(c);
      }
      wayMap.set(el.id, coords);

      if (coords.length < 3) continue;

      const tags = el.tags || {};
      const feature = {
        type: 'Feature' as const,
        properties: { id: idCounter++, ...tags },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [coords],
        },
      };

      if (tags.building) {
        buildings.push(feature);
      } else if (tags.leisure === 'park' || tags.landuse === 'recreation_ground' || tags.boundary === 'national_park') {
        parks.push(feature);
      } else if (tags.natural === 'water' || tags.waterway) {
        water.push(feature);
      } else if (tags.highway) {
        // Roads are linestrings, not polygons
        roads.push({
          type: 'Feature' as const,
          properties: { id: idCounter++, ...tags, layerType: 'road' },
          geometry: {
            type: 'LineString' as const,
            coordinates: coords,
          },
        });
      } else if (tags.place || tags.admin_level) {
        surface.push(feature);
      }
    }

    if (el.type === 'relation' && el.members) {
      const tags = el.tags || {};
      // Build multipolygon from outer ways
      const outerRings: [number, number][][] = [];
      for (const member of el.members) {
        if (member.type === 'way' && member.role === 'outer') {
          const coords = wayMap.get(member.ref);
          if (coords && coords.length >= 3) {
            outerRings.push(coords);
          }
        }
      }

      if (outerRings.length === 0) continue;

      const feature = {
        type: 'Feature' as const,
        properties: { id: idCounter++, ...tags },
        geometry: outerRings.length === 1
          ? { type: 'Polygon' as const, coordinates: [outerRings[0]] }
          : { type: 'MultiPolygon' as const, coordinates: outerRings.map(r => [r]) },
      };

      if (tags.building) {
        buildings.push(feature);
      } else if (tags.leisure === 'park' || tags.landuse === 'recreation_ground') {
        parks.push(feature);
      } else if (tags.natural === 'water' || tags.waterway) {
        water.push(feature);
      }
    }
  }

  console.log(`OSM parsing complete: ${buildings.length} buildings, ${parks.length} parks, ${water.length} water, ${roads.length} roads, ${surface.length} surface`);

  return {
    buildings: { type: 'FeatureCollection', features: buildings },
    parks: { type: 'FeatureCollection', features: parks },
    water: { type: 'FeatureCollection', features: water },
    roads: { type: 'FeatureCollection', features: roads },
    surface: { type: 'FeatureCollection', features: surface },
  };
}

export async function loadOSMData(): Promise<{
  buildings: FeatureCollection<Polygon | MultiPolygon>;
  parks: FeatureCollection<Polygon | MultiPolygon>;
  water: FeatureCollection<Polygon | MultiPolygon>;
  roads: FeatureCollection<LineString | MultiLineString>;
  surface: FeatureCollection<Polygon | MultiPolygon>;
}> {
  console.log('Loading OSM layers via Overpass API...');
  setStatus('Fetching OSM data for Manhattan Island...');

  // Single combined query for all layer types from Manhattan Island area
  const query = `
[out:json][timeout:120];
area["name"="Manhattan Island"]->.manhattan;
(
  way["building"](area.manhattan);
  relation["building"](area.manhattan);
  way["leisure"="park"](area.manhattan);
  relation["leisure"="park"](area.manhattan);
  way["natural"="water"](area.manhattan);
  relation["natural"="water"](area.manhattan);
  way["highway"~"^(primary|secondary|tertiary|residential|trunk|motorway)$"](area.manhattan);
);
out body;
>;
out skel qt;
`;

  console.log('Fetching Overpass API...');
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.pow(2, attempt) * 2000;
        console.log(`Retry attempt ${attempt + 1}, waiting ${delay}ms...`);
        setStatus(`Retrying OSM fetch (attempt ${attempt + 1})...`);
        await new Promise(r => setTimeout(r, delay));
      }

      const response = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });

      if (response.status === 429) {
        console.warn('Overpass API rate limited (429)');
        lastError = new Error('Rate limited');
        continue;
      }

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status}`);
      }

      const data = await response.json();
      const size = JSON.stringify(data).length;
      console.log(`Overpass response received: ${(size / 1024 / 1024).toFixed(1)} MB, ${data.elements.length} elements`);
      setStatus('Parsing OSM data...');

      const result = osmToGeoJSON(data.elements);
      console.log(`OSM buildings loaded: ${result.buildings.features.length} features`);
      console.log(`OSM parks loaded: ${result.parks.features.length} features`);
      console.log(`OSM water loaded: ${result.water.features.length} features`);
      console.log(`OSM roads loaded: ${result.roads.features.length} features`);

      return result;
    } catch (e: any) {
      lastError = e;
      console.error(`Overpass fetch failed (attempt ${attempt + 1}):`, e.message);
    }
  }

  throw lastError || new Error('Failed to load OSM data');
}

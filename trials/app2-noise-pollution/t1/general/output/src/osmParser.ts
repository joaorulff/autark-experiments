/**
 * Converts raw Overpass JSON response into GeoJSON FeatureCollections
 * for each layer type: buildings, parks, water, roads, surface (boundary).
 */

import type { Feature, FeatureCollection, Polygon, LineString, Position } from 'geojson';

interface OsmNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OsmWay {
  type: 'way';
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}

interface OsmRelation {
  type: 'relation';
  id: number;
  members: { type: string; ref: number; role: string }[];
  tags?: Record<string, string>;
}

type OsmElement = OsmNode | OsmWay | OsmRelation;

interface ParsedLayers {
  buildings: FeatureCollection<Polygon>;
  parks: FeatureCollection<Polygon>;
  water: FeatureCollection<Polygon | LineString>;
  roads: FeatureCollection<LineString>;
}

export function parseOverpassResponse(data: { elements: OsmElement[] }): ParsedLayers {
  console.log('[Parser] Parsing Overpass response...');

  // Index nodes by id
  const nodeMap = new Map<number, [number, number]>();
  const wayMap = new Map<number, OsmWay>();

  for (const el of data.elements) {
    if (el.type === 'node') {
      nodeMap.set(el.id, [(el as OsmNode).lon, (el as OsmNode).lat]);
    } else if (el.type === 'way') {
      wayMap.set(el.id, el as OsmWay);
    }
  }

  console.log(`[Parser] Indexed ${nodeMap.size} nodes, ${wayMap.size} ways`);

  function wayToCoords(way: OsmWay): Position[] | null {
    const coords: Position[] = [];
    for (const nid of way.nodes) {
      const c = nodeMap.get(nid);
      if (!c) return null;
      coords.push(c);
    }
    return coords;
  }

  function isClosedWay(coords: Position[]): boolean {
    if (coords.length < 4) return false;
    return coords[0][0] === coords[coords.length - 1][0] &&
           coords[0][1] === coords[coords.length - 1][1];
  }

  const buildings: Feature<Polygon>[] = [];
  const parks: Feature<Polygon>[] = [];
  const water: Feature<Polygon | LineString>[] = [];
  const roads: Feature<LineString>[] = [];

  for (const el of data.elements) {
    if (el.type !== 'way' || !el.tags) continue;
    const coords = wayToCoords(el as OsmWay);
    if (!coords || coords.length < 2) continue;

    const tags = el.tags;
    const props = { ...tags, osmId: el.id };

    if (tags.building) {
      if (isClosedWay(coords)) {
        buildings.push({
          type: 'Feature',
          properties: { ...props, layerType: 'building' },
          geometry: { type: 'Polygon', coordinates: [coords] },
        });
      }
    } else if (tags.leisure === 'park' || tags.landuse === 'grass') {
      if (isClosedWay(coords)) {
        parks.push({
          type: 'Feature',
          properties: { ...props, layerType: 'park' },
          geometry: { type: 'Polygon', coordinates: [coords] },
        });
      }
    } else if (tags.natural === 'water' || tags.waterway) {
      if (isClosedWay(coords)) {
        water.push({
          type: 'Feature',
          properties: { ...props, layerType: 'water' },
          geometry: { type: 'Polygon', coordinates: [coords] },
        });
      } else {
        water.push({
          type: 'Feature',
          properties: { ...props, layerType: 'water' },
          geometry: { type: 'LineString', coordinates: coords },
        });
      }
    } else if (tags.highway) {
      roads.push({
        type: 'Feature',
        properties: { ...props, layerType: 'road' },
        geometry: { type: 'LineString', coordinates: coords },
      });
    }
  }

  // Also handle relations (multipolygons) for buildings/parks/water
  for (const el of data.elements) {
    if (el.type !== 'relation' || !el.tags) continue;
    const rel = el as OsmRelation;
    const tags = rel.tags!;

    // Build outer ring from outer members
    const outerWays = rel.members
      .filter(m => m.type === 'way' && m.role === 'outer')
      .map(m => wayMap.get(m.ref))
      .filter((w): w is OsmWay => !!w);

    if (outerWays.length === 0) continue;

    // Merge outer ways into rings
    const rings = mergeWaysIntoRings(outerWays, nodeMap);
    if (rings.length === 0) continue;

    const props = { ...tags, osmId: el.id, layerType: '' };

    for (const ring of rings) {
      if (ring.length < 4) continue;
      const feature: Feature<Polygon> = {
        type: 'Feature',
        properties: { ...props },
        geometry: { type: 'Polygon', coordinates: [ring] },
      };

      if (tags.building) {
        feature.properties!.layerType = 'building';
        buildings.push(feature);
      } else if (tags.leisure === 'park') {
        feature.properties!.layerType = 'park';
        parks.push(feature);
      } else if (tags.natural === 'water') {
        feature.properties!.layerType = 'water';
        water.push(feature as Feature<Polygon | LineString>);
      }
    }
  }

  console.log(`[Parser] Parsed: ${buildings.length} buildings, ${parks.length} parks, ${water.length} water, ${roads.length} roads`);

  return {
    buildings: { type: 'FeatureCollection', features: buildings },
    parks: { type: 'FeatureCollection', features: parks },
    water: { type: 'FeatureCollection', features: water },
    roads: { type: 'FeatureCollection', features: roads },
  };
}

function mergeWaysIntoRings(
  ways: OsmWay[],
  nodeMap: Map<number, [number, number]>
): Position[][] {
  const rings: Position[][] = [];
  const used = new Set<number>();

  for (const startWay of ways) {
    if (used.has(startWay.id)) continue;

    const nodeIds: number[] = [...startWay.nodes];
    used.add(startWay.id);

    // Try to extend the chain
    let changed = true;
    while (changed) {
      changed = false;
      for (const w of ways) {
        if (used.has(w.id)) continue;
        const lastNode = nodeIds[nodeIds.length - 1];
        const firstNode = nodeIds[0];

        if (w.nodes[0] === lastNode) {
          nodeIds.push(...w.nodes.slice(1));
          used.add(w.id);
          changed = true;
        } else if (w.nodes[w.nodes.length - 1] === lastNode) {
          nodeIds.push(...[...w.nodes].reverse().slice(1));
          used.add(w.id);
          changed = true;
        } else if (w.nodes[w.nodes.length - 1] === firstNode) {
          nodeIds.unshift(...w.nodes.slice(0, -1));
          used.add(w.id);
          changed = true;
        } else if (w.nodes[0] === firstNode) {
          nodeIds.unshift(...[...w.nodes].reverse().slice(0, -1));
          used.add(w.id);
          changed = true;
        }
      }
    }

    // Convert to coordinates
    const coords: Position[] = [];
    for (const nid of nodeIds) {
      const c = nodeMap.get(nid);
      if (c) coords.push(c);
    }

    // Close ring if not closed
    if (coords.length >= 3) {
      if (coords[0][0] !== coords[coords.length - 1][0] ||
          coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push([...coords[0]]);
      }
      rings.push(coords);
    }
  }

  return rings;
}

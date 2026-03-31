import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Papa from 'papaparse';

import {
  fetchManhattanSurface,
  fetchParksAndWater,
  fetchRoads,
  fetchBuildings,
  assignFeatureIds,
} from './overpass';
import { computeBuildingProximity } from './spatial';
import type { SubwayStation } from './types';
import { SUBWAY_COLOR_SCALE, SELECTED_COLOR, LAYER_COLORS } from './types';

// ── UI helpers ──────────────────────────────────────────

const statusEl = document.getElementById('loading-status')!;
const overlayEl = document.getElementById('loading-overlay')!;
const infoPanel = document.getElementById('info-panel')!;
const infoTitle = document.getElementById('info-title')!;
const infoBody = document.getElementById('info-body')!;

function setStatus(msg: string) {
  statusEl.textContent = msg;
  console.log(`[Status] ${msg}`);
}

function hideOverlay() {
  overlayEl.classList.add('hidden');
}

function showInfo(title: string, html: string) {
  infoTitle.textContent = title;
  infoBody.innerHTML = html;
  infoPanel.classList.add('visible');
}

// ── Subway data ─────────────────────────────────────────

async function loadSubwayStations(): Promise<SubwayStation[]> {
  console.log('[Data] Loading subway stations CSV…');
  const res = await fetch('/subway_manhattan_clean.csv');
  const text = await res.text();
  const parsed = Papa.parse<SubwayStation>(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
  console.log(`[Data] Parsed ${parsed.data.length} subway stations`);
  return parsed.data;
}

// ── Map setup ───────────────────────────────────────────

function createMap(): maplibregl.Map {
  console.log('[Map] Initializing MapLibre GL…');
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      },
      layers: [
        {
          id: 'osm-base',
          type: 'raster',
          source: 'osm-tiles',
          paint: { 'raster-opacity': 0.35 },
        },
      ],
    },
    center: [-73.9712, 40.7831],
    zoom: 13,
    pitch: 50,
    bearing: -17.6,
    antialias: true,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-left');
  return map;
}

// ── Color expressions ───────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Expr = any;

function buildSubwayColorExpr(): Expr {
  const steps: (string | number)[] = [];
  for (let i = 0; i < SUBWAY_COLOR_SCALE.length; i++) {
    const [threshold, color] = SUBWAY_COLOR_SCALE[i];
    if (i === 0) {
      steps.push(color);
    } else {
      steps.push(threshold, color);
    }
  }
  return [
    'case',
    ['boolean', ['feature-state', 'selected'], false],
    SELECTED_COLOR,
    ['step', ['get', 'subwayCount'], ...steps],
  ];
}

function selectedFillColor(baseColor: string): Expr {
  return [
    'case',
    ['boolean', ['feature-state', 'selected'], false],
    SELECTED_COLOR,
    baseColor,
  ];
}

function selectedLineColor(baseColor: string): Expr {
  return [
    'case',
    ['boolean', ['feature-state', 'selected'], false],
    SELECTED_COLOR,
    baseColor,
  ];
}

// ── Layer addition helpers ──────────────────────────────

function addPolygonLayer(
  map: maplibregl.Map,
  id: string,
  data: GeoJSON.FeatureCollection,
  color: string,
  opacity = 0.6,
) {
  map.addSource(id, { type: 'geojson', data, promoteId: 'id' });
  map.addLayer({
    id,
    type: 'fill',
    source: id,
    paint: {
      'fill-color': selectedFillColor(color),
      'fill-opacity': opacity,
    },
  });
  console.log(`[Map] Added polygon layer "${id}" with ${data.features.length} features`);
}

function addLineLayer(
  map: maplibregl.Map,
  id: string,
  data: GeoJSON.FeatureCollection,
  color: string,
  width = 1,
) {
  map.addSource(id, { type: 'geojson', data, promoteId: 'id' });
  map.addLayer({
    id,
    type: 'line',
    source: id,
    paint: {
      'line-color': selectedLineColor(color),
      'line-width': width,
      'line-opacity': 0.7,
    },
  });
  console.log(`[Map] Added line layer "${id}" with ${data.features.length} features`);
}

function addBuildingsLayer(map: maplibregl.Map, data: GeoJSON.FeatureCollection) {
  map.addSource('buildings', { type: 'geojson', data, promoteId: 'id' });
  map.addLayer({
    id: 'buildings',
    type: 'fill-extrusion',
    source: 'buildings',
    paint: {
      'fill-extrusion-color': buildSubwayColorExpr(),
      'fill-extrusion-height': [
        'coalesce',
        ['to-number', ['get', 'height'], 0],
        ['*', ['to-number', ['get', 'building:levels'], 0], 3.5],
        12,
      ],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.85,
    },
  });
  console.log(`[Map] Added 3D buildings layer with ${data.features.length} features`);
}

function addSubwayMarkers(map: maplibregl.Map, stations: SubwayStation[]) {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: stations.map((s, i) => ({
      type: 'Feature' as const,
      id: i,
      geometry: { type: 'Point' as const, coordinates: [s.longitude, s.latitude] },
      properties: { key: s.key },
    })),
  };
  map.addSource('subway-stations', { type: 'geojson', data: geojson });
  map.addLayer({
    id: 'subway-stations',
    type: 'circle',
    source: 'subway-stations',
    paint: {
      'circle-radius': 5,
      'circle-color': '#e11d48',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  });
  console.log(`[Map] Added ${stations.length} subway station markers`);
}

// ── Selection / picking ─────────────────────────────────

const PICKABLE_LAYERS = ['surface', 'parks', 'water', 'roads', 'buildings'];

interface SelectedFeature {
  source: string;
  id: number;
}

function setupPicking(map: maplibregl.Map) {
  const selected = new Map<string, SelectedFeature>();

  map.on('click', (e) => {
    // Query all pickable layers
    const existingLayerIds = PICKABLE_LAYERS.filter((id) => !!map.getLayer(id));
    const features = map.queryRenderedFeatures(e.point, { layers: existingLayerIds });

    if (features.length === 0) {
      // Click on empty space: deselect all
      for (const [, sel] of selected) {
        map.setFeatureState({ source: sel.source, id: sel.id }, { selected: false });
      }
      selected.clear();
      infoPanel.classList.remove('visible');
      console.log('[Pick] Cleared selection');
      return;
    }

    const f = features[0];
    const source = f.source;
    const fid = f.id as number;
    const key = `${source}:${fid}`;

    if (selected.has(key)) {
      // Deselect
      map.setFeatureState({ source, id: fid }, { selected: false });
      selected.delete(key);
      infoPanel.classList.remove('visible');
      console.log(`[Pick] Deselected ${key}`);
    } else {
      // Select (deselect previous in same layer first)
      for (const [k, sel] of selected) {
        map.setFeatureState({ source: sel.source, id: sel.id }, { selected: false });
        selected.delete(k);
      }
      map.setFeatureState({ source, id: fid }, { selected: true });
      selected.set(key, { source, id: fid });
      console.log(`[Pick] Selected ${key}`);

      // Show info
      const props = f.properties ?? {};
      const title = props.name || `${source} feature #${fid}`;
      let html = '';
      const interestingKeys = ['name', 'building', 'leisure', 'natural', 'highway', 'subwayCount', 'height', 'building:levels', 'addr:street', 'addr:housenumber'];
      for (const k of interestingKeys) {
        if (props[k] !== undefined && props[k] !== null && props[k] !== '') {
          html += `<p><strong>${k}:</strong> ${props[k]}</p>`;
        }
      }
      if (!html) html = `<p>Layer: ${source}</p>`;
      showInfo(title, html);
    }
  });

  // Pointer cursor on hover
  for (const layerId of PICKABLE_LAYERS) {
    map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
  }

  console.log('[Pick] Selection handler registered for layers:', PICKABLE_LAYERS.join(', '));
}

// ── Main ────────────────────────────────────────────────

async function main() {
  console.log('[App] Manhattan Subway Accessibility 3D — starting');

  const map = createMap();

  await new Promise<void>((resolve) => map.on('load', resolve));
  console.log('[Map] Base map loaded');

  // 1. Load subway data
  setStatus('Loading subway station data…');
  const stations = await loadSubwayStations();

  // 2. Fetch surface boundary
  setStatus('Fetching Manhattan surface boundary…');
  try {
    const surface = assignFeatureIds(await fetchManhattanSurface());
    if (surface.features.length > 0) {
      addPolygonLayer(map, 'surface', surface, LAYER_COLORS.surface, 0.4);
    } else {
      console.warn('[Map] No surface boundary features found');
    }
  } catch (err) {
    console.error('[Map] Failed to load surface:', err);
  }

  // Small delay between Overpass requests
  await new Promise((r) => setTimeout(r, 2000));

  // 3. Fetch parks and water
  setStatus('Fetching parks and water bodies…');
  try {
    const { parks, water } = await fetchParksAndWater();
    if (parks.features.length > 0) {
      addPolygonLayer(map, 'parks', assignFeatureIds(parks), LAYER_COLORS.parks, 0.65);
    }
    if (water.features.length > 0) {
      addPolygonLayer(map, 'water', assignFeatureIds(water), LAYER_COLORS.water, 0.6);
    }
  } catch (err) {
    console.error('[Map] Failed to load parks/water:', err);
  }

  await new Promise((r) => setTimeout(r, 2000));

  // 4. Fetch roads
  setStatus('Fetching road network…');
  try {
    const roads = assignFeatureIds(await fetchRoads());
    if (roads.features.length > 0) {
      addLineLayer(map, 'roads', roads, LAYER_COLORS.roads, 1.2);
    }
  } catch (err) {
    console.error('[Map] Failed to load roads:', err);
  }

  await new Promise((r) => setTimeout(r, 2000));

  // 5. Fetch buildings
  setStatus('Fetching buildings (this may take 30–60 seconds)…');
  try {
    let buildings = assignFeatureIds(await fetchBuildings());

    // 6. Compute subway proximity
    setStatus('Computing subway accessibility for each building…');
    buildings = computeBuildingProximity(buildings, stations, 500);

    addBuildingsLayer(map, buildings);
  } catch (err) {
    console.error('[Map] Failed to load buildings:', err);
  }

  // 7. Add subway station markers on top
  addSubwayMarkers(map, stations);

  // 8. Setup picking
  setupPicking(map);

  // Done
  hideOverlay();
  console.log('[App] All layers loaded — application ready');
}

main().catch((err) => {
  console.error('[App] Fatal error:', err);
  setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
});

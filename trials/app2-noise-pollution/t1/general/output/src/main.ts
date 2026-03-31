import { Deck } from '@deck.gl/core';
import { GeoJsonLayer } from '@deck.gl/layers';
import type { Feature, FeatureCollection, Polygon, LineString } from 'geojson';
import { fetchAllManhattanData } from './overpass';
import { parseOverpassResponse } from './osmParser';
import { loadNoiseData } from './noiseLoader';
import { computeNoiseCounts } from './spatialJoin';
import {
  getColorForCount,
  SELECTED_COLOR,
  PARK_COLOR,
  WATER_COLOR,
  ROAD_COLOR,
  SURFACE_COLOR,
} from './colorScale';

// ── Types ──

type RGBA = [number, number, number, number];

interface SelectedItem {
  layerType: string;
  index: number;
  osmId?: number;
}

// ── State ──

let selectedItems: SelectedItem[] = [];
let noiseCounts: Map<number, number> = new Map();
let deckInstance: Deck | null = null;

// Layer data references for re-render
let buildingsData: FeatureCollection<Polygon> | null = null;
let parksData: FeatureCollection<Polygon> | null = null;
let waterData: FeatureCollection<Polygon | LineString> | null = null;
let roadsData: FeatureCollection<LineString> | null = null;
let surfaceData: FeatureCollection<Polygon> | null = null;

// ── UI Helpers ──

function setStatus(msg: string) {
  const el = document.getElementById('loading-status');
  if (el) el.textContent = msg;
  console.log(`[Status] ${msg}`);
}

function hideLoading() {
  const el = document.getElementById('loading');
  if (el) el.style.display = 'none';
}

function showTooltip(x: number, y: number, html: string) {
  const el = document.getElementById('tooltip')!;
  el.style.display = 'block';
  el.style.left = `${x + 12}px`;
  el.style.top = `${y + 12}px`;
  el.innerHTML = html;
}

function hideTooltip() {
  const el = document.getElementById('tooltip')!;
  el.style.display = 'none';
}

// ── Selection ──

function isSelected(layerType: string, index: number): boolean {
  return selectedItems.some(s => s.layerType === layerType && s.index === index);
}

function toggleSelection(layerType: string, index: number, osmId?: number) {
  const existing = selectedItems.findIndex(
    s => s.layerType === layerType && s.index === index
  );
  if (existing >= 0) {
    selectedItems.splice(existing, 1);
    console.log(`[Selection] Deselected ${layerType} #${index}`);
  } else {
    selectedItems.push({ layerType, index, osmId });
    console.log(`[Selection] Selected ${layerType} #${index} (osmId: ${osmId})`);
  }
  renderLayers();
}

// ── Layer Creation ──

function createLayers(): GeoJsonLayer[] {
  const layers: GeoJsonLayer[] = [];

  // Surface layer (Manhattan boundary fill)
  if (surfaceData && surfaceData.features.length > 0) {
    layers.push(
      new GeoJsonLayer({
        id: 'surface-layer',
        data: surfaceData as any,
        filled: true,
        stroked: false,
        getFillColor: (f: any, { index }: { index: number }) =>
          isSelected('surface', index) ? SELECTED_COLOR : SURFACE_COLOR,
        pickable: true,
        onClick: (info: any) => {
          if (info.index >= 0) toggleSelection('surface', info.index, info.object?.properties?.osmId);
        },
        onHover: (info: any) => {
          if (info.object) {
            showTooltip(info.x, info.y, `<b>Surface</b><br>Manhattan Island`);
          } else {
            hideTooltip();
          }
        },
        updateTriggers: {
          getFillColor: [selectedItems.length, ...selectedItems.map(s => `${s.layerType}-${s.index}`)],
        },
      })
    );
  }

  // Parks layer
  if (parksData) {
    layers.push(
      new GeoJsonLayer({
        id: 'parks-layer',
        data: parksData as any,
        filled: true,
        stroked: true,
        getFillColor: (f: any, { index }: { index: number }) =>
          isSelected('park', index) ? SELECTED_COLOR : PARK_COLOR,
        getLineColor: [60, 140, 50, 200] as any,
        getLineWidth: 1,
        lineWidthMinPixels: 1,
        pickable: true,
        onClick: (info: any) => {
          if (info.index >= 0) toggleSelection('park', info.index, info.object?.properties?.osmId);
        },
        onHover: (info: any) => {
          if (info.object) {
            const name = info.object.properties?.name || 'Park';
            showTooltip(info.x, info.y, `<b>Park:</b> ${name}`);
          } else {
            hideTooltip();
          }
        },
        updateTriggers: {
          getFillColor: [selectedItems.length, ...selectedItems.map(s => `${s.layerType}-${s.index}`)],
        },
      })
    );
  }

  // Water layer
  if (waterData) {
    layers.push(
      new GeoJsonLayer({
        id: 'water-layer',
        data: waterData as any,
        filled: true,
        stroked: true,
        getFillColor: (f: any, { index }: { index: number }) =>
          isSelected('water', index) ? SELECTED_COLOR : WATER_COLOR,
        getLineColor: [70, 120, 200, 200] as any,
        getLineWidth: 2,
        lineWidthMinPixels: 1,
        pickable: true,
        onClick: (info: any) => {
          if (info.index >= 0) toggleSelection('water', info.index, info.object?.properties?.osmId);
        },
        onHover: (info: any) => {
          if (info.object) {
            const name = info.object.properties?.name || 'Water';
            showTooltip(info.x, info.y, `<b>Water:</b> ${name}`);
          } else {
            hideTooltip();
          }
        },
        updateTriggers: {
          getFillColor: [selectedItems.length, ...selectedItems.map(s => `${s.layerType}-${s.index}`)],
        },
      })
    );
  }

  // Roads layer
  if (roadsData) {
    layers.push(
      new GeoJsonLayer({
        id: 'roads-layer',
        data: roadsData as any,
        filled: false,
        stroked: true,
        getLineColor: (f: any, { index }: { index: number }) =>
          isSelected('road', index) ? SELECTED_COLOR : ROAD_COLOR,
        getLineWidth: 2,
        lineWidthMinPixels: 1,
        pickable: true,
        onClick: (info: any) => {
          if (info.index >= 0) toggleSelection('road', info.index, info.object?.properties?.osmId);
        },
        onHover: (info: any) => {
          if (info.object) {
            const name = info.object.properties?.name || info.object.properties?.highway || 'Road';
            showTooltip(info.x, info.y, `<b>Road:</b> ${name}`);
          } else {
            hideTooltip();
          }
        },
        updateTriggers: {
          getLineColor: [selectedItems.length, ...selectedItems.map(s => `${s.layerType}-${s.index}`)],
        },
      })
    );
  }

  // Buildings layer (3D extruded, colored by noise count)
  if (buildingsData) {
    layers.push(
      new GeoJsonLayer({
        id: 'buildings-layer',
        data: buildingsData as any,
        filled: true,
        stroked: true,
        extruded: true,
        wireframe: false,
        getElevation: (f: any) => {
          const levels = parseFloat(f.properties?.['building:levels']) || 3;
          return levels * 3.5; // ~3.5m per floor
        },
        getFillColor: (f: any, { index }: { index: number }) => {
          if (isSelected('building', index)) return SELECTED_COLOR;
          const count = noiseCounts.get(index) ?? 0;
          return getColorForCount(count);
        },
        getLineColor: [80, 80, 80, 100] as any,
        getLineWidth: 0.5,
        lineWidthMinPixels: 0.5,
        pickable: true,
        onClick: (info: any) => {
          if (info.index >= 0) toggleSelection('building', info.index, info.object?.properties?.osmId);
        },
        onHover: (info: any) => {
          if (info.object) {
            const count = noiseCounts.get(info.index) ?? 0;
            const name = info.object.properties?.name || 'Building';
            const addr = info.object.properties?.['addr:street']
              ? `${info.object.properties?.['addr:housenumber'] || ''} ${info.object.properties?.['addr:street']}`
              : '';
            showTooltip(
              info.x, info.y,
              `<b>${name}</b>${addr ? '<br>' + addr : ''}<br>Noise complaints nearby: <b>${count}</b>`
            );
          } else {
            hideTooltip();
          }
        },
        updateTriggers: {
          getFillColor: [selectedItems.length, ...selectedItems.map(s => `${s.layerType}-${s.index}`), noiseCounts.size],
        },
      })
    );
  }

  return layers;
}

function renderLayers() {
  if (!deckInstance) return;
  deckInstance.setProps({ layers: createLayers() });
}

// ── Main ──

async function main() {
  console.log('[App] Starting Manhattan Buildings - Noise Accessibility 3D Map');
  setStatus('Initializing renderer...');

  // Initialize deck.gl
  deckInstance = new Deck({
    parent: document.getElementById('map') as HTMLDivElement,
    initialViewState: {
      longitude: -73.97,
      latitude: 40.78,
      zoom: 13,
      pitch: 45,
      bearing: -17,
      minZoom: 10,
      maxZoom: 20,
    },
    controller: true,
    getTooltip: () => null,
    layers: [],
  });

  console.log('[App] Deck.gl initialized');

  // Load data in parallel: OSM data + noise data
  setStatus('Loading OSM data and noise data...');

  const [osmRaw, noisePoints] = await Promise.all([
    fetchAllManhattanData(),
    loadNoiseData('/noise.csv'),
  ]);

  // Parse OSM data
  setStatus('Parsing OSM data...');
  const layers = parseOverpassResponse(osmRaw);

  buildingsData = layers.buildings;
  parksData = layers.parks;
  waterData = layers.water;
  roadsData = layers.roads;

  // Create a simple surface polygon from Manhattan bounding box
  // (the boundary relation is complex; we use a simple rectangle as background)
  surfaceData = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { layerType: 'surface', name: 'Manhattan Island' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-74.02, 40.70],
          [-73.907, 40.70],
          [-73.907, 40.882],
          [-74.02, 40.882],
          [-74.02, 40.70],
        ]],
      },
    }],
  };

  // Initial render with layers (before spatial join for faster feedback)
  setStatus('Rendering initial layers...');
  renderLayers();
  console.log('[App] Initial layers rendered');

  // Compute spatial join
  setStatus('Computing noise proximity for buildings...');
  noiseCounts = computeNoiseCounts(buildingsData, noisePoints);

  // Re-render with noise colors
  setStatus('Applying noise colors...');
  renderLayers();
  console.log('[App] Scene rendered with all layers and noise data');

  // Hide loading screen
  hideLoading();
  setStatus('Done');
  console.log('[App] Application ready');
}

main().catch(err => {
  console.error('[App] Fatal error:', err);
  setStatus(`Error: ${err.message}`);
});

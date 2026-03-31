/**
 * 3D Map rendering using deck.gl + MapLibre GL.
 */

import { Deck } from '@deck.gl/core';
import { GeoJsonLayer } from '@deck.gl/layers';
import maplibregl from 'maplibre-gl';
import type { FeatureCollection, Polygon, MultiPolygon, LineString, MultiLineString } from 'geojson';
import type { BuildingProperties, LayerFeatureProperties } from './types';
import {
  getColorForNoise,
  SELECTED_COLOR, HIGHLIGHTED_COLOR,
  PARK_COLOR, PARK_SELECTED,
  WATER_COLOR, WATER_SELECTED,
  ROAD_COLOR, ROAD_SELECTED,
  SURFACE_COLOR, SURFACE_SELECTED,
} from './colors';

// Manhattan center
const INITIAL_VIEW = {
  longitude: -73.97,
  latitude: 40.78,
  zoom: 13,
  pitch: 45,
  bearing: -17,
};

interface MapState {
  deck: Deck | null;
  map: maplibregl.Map | null;
  selectedFeatureId: number | null;
  selectedLayerType: string | null;
  highlightedBuildingIds: Set<number>;
  buildings: FeatureCollection<Polygon | MultiPolygon> | null;
  parks: FeatureCollection<Polygon | MultiPolygon> | null;
  water: FeatureCollection<Polygon | MultiPolygon> | null;
  roads: FeatureCollection<LineString | MultiLineString> | null;
  surface: FeatureCollection<Polygon | MultiPolygon> | null;
}

const state: MapState = {
  deck: null,
  map: null,
  selectedFeatureId: null,
  selectedLayerType: null,
  highlightedBuildingIds: new Set(),
  buildings: null,
  parks: null,
  water: null,
  roads: null,
  surface: null,
};

function showInfo(props: Record<string, unknown>, layerType: string) {
  const panel = document.getElementById('info-panel')!;
  let html = `<h3>${layerType} Selected</h3>`;
  const skip = new Set(['id', 'selected', 'highlighted', 'layerType']);
  for (const [k, v] of Object.entries(props)) {
    if (skip.has(k) || v === undefined || v === null || v === '') continue;
    const label = k.replace(/_/g, ' ');
    let value = String(v);
    if (k === 'area' && typeof v === 'number') value = `${v.toFixed(1)} m²`;
    html += `<p><strong>${label}:</strong> ${value}</p>`;
  }
  panel.innerHTML = html;
}

function buildLayers(): GeoJsonLayer<any>[] {
  const layers: GeoJsonLayer<any>[] = [];

  // Surface layer
  if (state.surface && state.surface.features.length > 0) {
    layers.push(
      new GeoJsonLayer({
        id: 'surface-layer',
        data: state.surface as any,
        pickable: true,
        stroked: true,
        filled: true,
        getFillColor: (f: any) =>
          f.properties.selected ? SURFACE_SELECTED : SURFACE_COLOR,
        getLineColor: [80, 80, 100, 100],
        getLineWidth: 1,
        lineWidthMinPixels: 1,
        onClick: (info: any) => handlePick(info, 'surface'),
        updateTriggers: {
          getFillColor: [state.selectedFeatureId, state.selectedLayerType],
        },
      })
    );
  }

  // Water layer
  if (state.water && state.water.features.length > 0) {
    layers.push(
      new GeoJsonLayer({
        id: 'water-layer',
        data: state.water as any,
        pickable: true,
        stroked: false,
        filled: true,
        getFillColor: (f: any) =>
          f.properties.selected ? WATER_SELECTED : WATER_COLOR,
        onClick: (info: any) => handlePick(info, 'water'),
        updateTriggers: {
          getFillColor: [state.selectedFeatureId, state.selectedLayerType],
        },
      })
    );
  }

  // Parks layer
  if (state.parks && state.parks.features.length > 0) {
    layers.push(
      new GeoJsonLayer({
        id: 'parks-layer',
        data: state.parks as any,
        pickable: true,
        stroked: false,
        filled: true,
        getFillColor: (f: any) =>
          f.properties.selected ? PARK_SELECTED : PARK_COLOR,
        onClick: (info: any) => handlePick(info, 'park'),
        updateTriggers: {
          getFillColor: [state.selectedFeatureId, state.selectedLayerType],
        },
      })
    );
  }

  // Roads layer
  if (state.roads && state.roads.features.length > 0) {
    layers.push(
      new GeoJsonLayer({
        id: 'roads-layer',
        data: state.roads as any,
        pickable: true,
        stroked: true,
        filled: false,
        getLineColor: (f: any) =>
          f.properties.selected ? ROAD_SELECTED : ROAD_COLOR,
        getLineWidth: 3,
        lineWidthMinPixels: 1,
        onClick: (info: any) => handlePick(info, 'road'),
        updateTriggers: {
          getLineColor: [state.selectedFeatureId, state.selectedLayerType],
        },
      })
    );
  }

  // Buildings layer (3D extruded)
  if (state.buildings && state.buildings.features.length > 0) {
    layers.push(
      new GeoJsonLayer({
        id: 'buildings-layer',
        data: state.buildings as any,
        pickable: true,
        stroked: false,
        filled: true,
        extruded: true,
        wireframe: false,
        getElevation: (f: any) => {
          const nc = f.properties.noiseCount || 0;
          return 20 + nc * 3;
        },
        getFillColor: (f: any) => {
          if (f.properties.selected) return SELECTED_COLOR;
          if (f.properties.highlighted || state.highlightedBuildingIds.has(f.properties.id)) {
            return HIGHLIGHTED_COLOR;
          }
          return getColorForNoise(f.properties.noiseCount || 0);
        },
        onClick: (info: any) => handlePick(info, 'building'),
        updateTriggers: {
          getFillColor: [state.selectedFeatureId, state.selectedLayerType, state.highlightedBuildingIds],
        },
      })
    );
  }

  return layers;
}

function handlePick(info: any, layerType: string) {
  if (!info.object) return;

  const props = info.object.properties;
  const featureId = props.id;

  console.log(`Picked ${layerType} feature id=${featureId}`);

  // Clear previous selection
  clearSelection();

  // Set new selection
  props.selected = true;
  state.selectedFeatureId = featureId;
  state.selectedLayerType = layerType;

  showInfo(props, layerType);
  updateLayers();
}

function clearSelection() {
  if (state.selectedFeatureId !== null && state.selectedLayerType) {
    const collections: Record<string, FeatureCollection<any> | null> = {
      building: state.buildings,
      park: state.parks,
      water: state.water,
      road: state.roads,
      surface: state.surface,
    };
    const coll = collections[state.selectedLayerType];
    if (coll) {
      for (const f of coll.features) {
        if (f.properties && f.properties.id === state.selectedFeatureId) {
          f.properties.selected = false;
        }
      }
    }
  }
  state.selectedFeatureId = null;
  state.selectedLayerType = null;
}

function updateLayers() {
  if (state.deck) {
    state.deck.setProps({ layers: buildLayers() });
  }
}

export function highlightBuildings(ids: Set<number>): void {
  state.highlightedBuildingIds = ids;
  console.log(`Map: highlighting ${ids.size} buildings from brush`);
  updateLayers();
}

export function initMap(data: {
  buildings: FeatureCollection<Polygon | MultiPolygon>;
  parks: FeatureCollection<Polygon | MultiPolygon>;
  water: FeatureCollection<Polygon | MultiPolygon>;
  roads: FeatureCollection<LineString | MultiLineString>;
  surface: FeatureCollection<Polygon | MultiPolygon>;
}): void {
  console.log('Initializing map renderer...');

  state.buildings = data.buildings;
  state.parks = data.parks;
  state.water = data.water;
  state.roads = data.roads;
  state.surface = data.surface;

  const container = document.getElementById('map-container')!;

  // Create map canvas container
  const mapDiv = document.createElement('div');
  mapDiv.id = 'maplibre-map';
  mapDiv.style.position = 'absolute';
  mapDiv.style.top = '0';
  mapDiv.style.left = '0';
  mapDiv.style.width = '100%';
  mapDiv.style.height = '100%';
  container.appendChild(mapDiv);

  // Create deck canvas container
  const deckCanvas = document.createElement('canvas');
  deckCanvas.id = 'deck-canvas';
  deckCanvas.style.position = 'absolute';
  deckCanvas.style.top = '0';
  deckCanvas.style.left = '0';
  deckCanvas.style.width = '100%';
  deckCanvas.style.height = '100%';
  container.appendChild(deckCanvas);

  // Initialize MapLibre
  const map = new maplibregl.Map({
    container: mapDiv,
    style: {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors',
        },
      },
      layers: [
        {
          id: 'osm-tiles',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
    center: [INITIAL_VIEW.longitude, INITIAL_VIEW.latitude],
    zoom: INITIAL_VIEW.zoom,
    pitch: INITIAL_VIEW.pitch,
    bearing: INITIAL_VIEW.bearing,
    interactive: true,
  });

  state.map = map;

  // Initialize deck.gl
  const deck = new Deck({
    canvas: deckCanvas,
    initialViewState: INITIAL_VIEW,
    controller: true,
    layers: buildLayers(),
    getTooltip: ({ object }: any) => {
      if (!object) return null;
      const p = object.properties;
      if (p.noiseCount !== undefined) {
        return {
          html: `<b>Building</b><br/>Noise: ${p.noiseCount}<br/>Area: ${p.area?.toFixed(0)} m²`,
          style: { background: 'rgba(22,33,62,0.95)', color: '#e0e0e0', fontSize: '12px', padding: '8px' },
        };
      }
      const name = p.name || p.highway || p.leisure || p.natural || 'Unknown';
      return {
        html: `<b>${name}</b>`,
        style: { background: 'rgba(22,33,62,0.95)', color: '#e0e0e0', fontSize: '12px', padding: '8px' },
      };
    },
    onViewStateChange: ({ viewState }: any) => {
      map.jumpTo({
        center: [viewState.longitude, viewState.latitude],
        zoom: viewState.zoom,
        bearing: viewState.bearing,
        pitch: viewState.pitch,
      });
    },
  });

  state.deck = deck;

  const layerCount = buildLayers().length;
  console.log(`Scene rendered with ${layerCount} layers`);
  console.log('Map initialization complete');
}

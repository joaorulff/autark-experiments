import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { GeoJsonLayer } from '@deck.gl/layers';
import type { Feature } from 'geojson';

import { loadOSMLayers } from './overpass';
import { loadNoiseData } from './noiseLoader';
import { spatialJoinNoiseToBuildings } from './spatialJoin';
import { createNoiseColorScale, SELECTED_COLOR, HIGHLIGHTED_COLOR } from './colorScale';
import { createScatterplot } from './scatterplot';
import type { BuildingFeature } from './types';

// App state
let selectedFeatureId: number | null = null;
let selectedLayerType: string | null = null;
let highlightedBuildingIds: Set<number> = new Set();
let buildingsData: BuildingFeature[] = [];
let colorFn: ReturnType<typeof createNoiseColorScale>;
let deckOverlay: MapboxOverlay;
let scatterplotApi: { highlightBuildings: (ids: Set<number>) => void } | null = null;

// All layer features cached for selection
let surfaceFeatures: Feature[] = [];
let parkFeatures: Feature[] = [];
let waterFeatures: Feature[] = [];
let roadFeatures: Feature[] = [];

function setLoading(text: string) {
  const el = document.getElementById('loading-text');
  if (el) el.textContent = text;
}

function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.classList.add('hidden');
}

function getSelectionColor(
  feature: Feature,
  layerType: string,
  defaultColor: [number, number, number, number]
): [number, number, number, number] {
  const fId = (feature.properties as Record<string, unknown>)?._featureIndex;
  if (selectedLayerType === layerType && selectedFeatureId === fId) {
    return SELECTED_COLOR;
  }
  return defaultColor;
}

function getBuildingColor(d: BuildingFeature): [number, number, number, number] {
  if (selectedLayerType === 'buildings' && selectedFeatureId === d.properties.id) {
    return SELECTED_COLOR;
  }
  if (highlightedBuildingIds.has(d.properties.id)) {
    return HIGHLIGHTED_COLOR;
  }
  return colorFn(d.properties.noiseCount);
}

function buildLayers() {
  return [
    // Surface layer
    new GeoJsonLayer({
      id: 'surface',
      data: surfaceFeatures,
      filled: true,
      stroked: true,
      getFillColor: (d) => getSelectionColor(d as Feature, 'surface', [230, 225, 215, 180]),
      getLineColor: [150, 150, 150, 100],
      getLineWidth: 1,
      pickable: true,
      updateTriggers: {
        getFillColor: [selectedFeatureId, selectedLayerType],
      },
    }),

    // Parks layer
    new GeoJsonLayer({
      id: 'parks',
      data: parkFeatures,
      filled: true,
      stroked: true,
      getFillColor: (d) => getSelectionColor(d as Feature, 'parks', [120, 190, 80, 200]),
      getLineColor: [80, 140, 50, 150],
      getLineWidth: 1,
      pickable: true,
      updateTriggers: {
        getFillColor: [selectedFeatureId, selectedLayerType],
      },
    }),

    // Water layer
    new GeoJsonLayer({
      id: 'water',
      data: waterFeatures,
      filled: true,
      stroked: false,
      getFillColor: (d) => getSelectionColor(d as Feature, 'water', [100, 160, 220, 200]),
      pickable: true,
      updateTriggers: {
        getFillColor: [selectedFeatureId, selectedLayerType],
      },
    }),

    // Roads layer
    new GeoJsonLayer({
      id: 'roads',
      data: roadFeatures,
      filled: false,
      stroked: true,
      getLineColor: (d) => {
        const fId = (d as Feature).properties?._featureIndex;
        if (selectedLayerType === 'roads' && selectedFeatureId === fId) {
          return SELECTED_COLOR;
        }
        return [80, 80, 80, 180] as [number, number, number, number];
      },
      getLineWidth: 2,
      pickable: true,
      updateTriggers: {
        getLineColor: [selectedFeatureId, selectedLayerType],
      },
    }),

    // Buildings layer (3D)
    new GeoJsonLayer({
      id: 'buildings',
      data: buildingsData,
      filled: true,
      stroked: true,
      extruded: true,
      wireframe: false,
      getElevation: (d) => {
        const levels = parseInt((d as BuildingFeature).properties?.['building:levels'] as string) || 3;
        return levels * 3.5;
      },
      getFillColor: (d) => getBuildingColor(d as BuildingFeature),
      getLineColor: [60, 60, 60, 100],
      getLineWidth: 0.5,
      pickable: true,
      updateTriggers: {
        getFillColor: [selectedFeatureId, selectedLayerType, highlightedBuildingIds],
      },
    }),
  ];
}

function handleClick(layerType: string, featureIndex: number) {
  console.log(`Clicked on ${layerType}, feature index: ${featureIndex}`);
  if (selectedLayerType === layerType && selectedFeatureId === featureIndex) {
    // Deselect
    selectedFeatureId = null;
    selectedLayerType = null;
  } else {
    selectedFeatureId = featureIndex;
    selectedLayerType = layerType;
  }
  deckOverlay.setProps({ layers: buildLayers() });
}

async function main() {
  console.log('Initializing Manhattan Noisescape application...');

  // Initialize map
  const map = new maplibregl.Map({
    container: 'map-container',
    style: {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#1a1a2e' },
        },
      ],
    },
    center: [-73.97, 40.775],
    zoom: 13,
    pitch: 45,
    bearing: -10,
    // antialias not in MapOptions type but supported at runtime
  });

  // Create initial deck overlay
  deckOverlay = new MapboxOverlay({
    layers: [],
  });
  map.addControl(deckOverlay as unknown as maplibregl.IControl);

  await new Promise<void>((resolve) => map.on('load', resolve));
  console.log('Map initialized');

  // Load data in parallel
  setLoading('Fetching OSM layers and noise data...');

  const [osmData, noiseRecords] = await Promise.all([loadOSMLayers(), loadNoiseData()]);

  // Add unique feature index to each feature for selection tracking
  const addIndex = (features: Feature[]) =>
    features.map((f, i) => ({
      ...f,
      properties: { ...f.properties, _featureIndex: i },
    }));

  surfaceFeatures = addIndex(osmData.surface);
  parkFeatures = addIndex(osmData.parks);
  waterFeatures = addIndex(osmData.water);
  roadFeatures = addIndex(osmData.roads);

  console.log('OSM layers indexed for selection');

  // Spatial join
  setLoading('Computing spatial join (noise to buildings)...');
  buildingsData = spatialJoinNoiseToBuildings(osmData.buildings, noiseRecords);

  // Create color scale
  const maxNoise = Math.max(...buildingsData.map((b) => b.properties.noiseCount), 1);
  console.log(`Max noise count per building: ${maxNoise}`);
  colorFn = createNoiseColorScale(maxNoise);

  // Setup deck layers with click handlers
  setLoading('Rendering 3D scene...');

  deckOverlay.setProps({
    layers: buildLayers(),
    onClick: (info) => {
      if (!info.layer || !info.object) return;
      const layerId = info.layer.id;
      if (layerId === 'buildings') {
        const bld = info.object as unknown as BuildingFeature;
        handleClick('buildings', bld.properties.id);
      } else {
        const feat = info.object as unknown as Feature;
        const idx = feat.properties?._featureIndex;
        if (idx !== undefined) {
          handleClick(layerId, idx as number);
        }
      }
    },
  });

  console.log('Scene rendered with 5 layers');

  // Create scatterplot
  const scatterContainer = document.getElementById('scatterplot');
  if (scatterContainer) {
    scatterplotApi = createScatterplot(scatterContainer, buildingsData, {
      onBrush(selectedIds: Set<number>) {
        console.log(`Brush selection: ${selectedIds.size} buildings`);
        highlightedBuildingIds = selectedIds;
        deckOverlay.setProps({ layers: buildLayers() });
      },
    }, colorFn);
  }

  hideLoading();
  console.log('Application fully loaded and interactive');
}

main().catch((err) => {
  console.error('Application error:', err);
  setLoading(`Error: ${err.message}`);
});

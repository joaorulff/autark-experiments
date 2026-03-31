import maplibregl from 'maplibre-gl';
import type { ManhattanLayers, LayerName } from '../data/types';
import { roadLengthColorExpression, SELECTION_COLOR, LAYER_COLORS } from './styles';
import type { ExpressionSpecification } from 'maplibre-gl';

const LAYER_IDS: LayerName[] = ['surface', 'parks', 'water', 'roads'];

interface SelectionState {
  source: string;
  id: number;
}

export class MapManager {
  private map: maplibregl.Map;
  private selection: SelectionState | null = null;
  private maxRoadLength = 2000;

  constructor() {
    console.log('Initializing MapLibre GL map...');
    this.map = new maplibregl.Map({
      container: 'map',
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#f0ece3' },
          },
          {
            id: 'osm-base',
            type: 'raster',
            source: 'osm-tiles',
            paint: { 'raster-opacity': 0.3 },
          },
        ],
      },
      center: [-73.97, 40.78],
      zoom: 12,
    });

    this.map.addControl(new maplibregl.NavigationControl(), 'top-right');
    console.log('Map initialized');
  }

  onReady(): Promise<void> {
    return new Promise((resolve) => {
      if (this.map.loaded()) {
        resolve();
      } else {
        this.map.on('load', () => resolve());
      }
    });
  }

  addLayers(layers: ManhattanLayers, maxRoadLength: number): void {
    console.log('Adding GeoJSON layers to map...');
    this.maxRoadLength = maxRoadLength;

    // Surface layer
    this.map.addSource('surface', {
      type: 'geojson',
      data: layers.surface,
      generateId: true,
    });
    this.map.addLayer({
      id: 'surface',
      type: 'fill',
      source: 'surface',
      paint: {
        'fill-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          SELECTION_COLOR,
          LAYER_COLORS.surface,
        ] as ExpressionSpecification,
        'fill-opacity': 0.7,
      },
    });

    // Parks layer
    this.map.addSource('parks', {
      type: 'geojson',
      data: layers.parks,
      generateId: true,
    });
    this.map.addLayer({
      id: 'parks',
      type: 'fill',
      source: 'parks',
      paint: {
        'fill-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          SELECTION_COLOR,
          LAYER_COLORS.parks,
        ] as ExpressionSpecification,
        'fill-opacity': 0.8,
      },
    });

    // Water layer
    this.map.addSource('water', {
      type: 'geojson',
      data: layers.water,
      generateId: true,
    });
    this.map.addLayer({
      id: 'water',
      type: 'fill',
      source: 'water',
      paint: {
        'fill-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          SELECTION_COLOR,
          LAYER_COLORS.water,
        ] as ExpressionSpecification,
        'fill-opacity': 0.8,
      },
    });

    // Roads layer
    this.map.addSource('roads', {
      type: 'geojson',
      data: layers.roads,
      generateId: true,
    });
    this.map.addLayer({
      id: 'roads',
      type: 'line',
      source: 'roads',
      paint: {
        'line-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          SELECTION_COLOR,
          roadLengthColorExpression(maxRoadLength),
        ] as ExpressionSpecification,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 0.5,
          14, 2,
          18, 5,
        ] as ExpressionSpecification,
      },
    });

    // Road outline for better visibility
    this.map.addLayer({
      id: 'roads-outline',
      type: 'line',
      source: 'roads',
      paint: {
        'line-color': 'rgba(0,0,0,0.15)',
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 1,
          14, 3,
          18, 7,
        ] as ExpressionSpecification,
      },
    }, 'roads'); // insert below roads

    console.log('All layers added to map');
    this.setupClickHandlers();
    this.setupLayerToggles();
  }

  private setupClickHandlers(): void {
    const infoPanel = document.getElementById('info-panel')!;
    const infoTable = document.querySelector('#info-table tbody')!;

    // Change cursor on hover for all layers
    for (const layerId of LAYER_IDS) {
      this.map.on('mouseenter', layerId, () => {
        this.map.getCanvas().style.cursor = 'pointer';
      });
      this.map.on('mouseleave', layerId, () => {
        this.map.getCanvas().style.cursor = '';
      });
    }

    this.map.on('click', (e) => {
      // Query all interactive layers
      const features = this.map.queryRenderedFeatures(e.point, {
        layers: LAYER_IDS,
      });

      // Clear previous selection
      if (this.selection) {
        this.map.setFeatureState(
          { source: this.selection.source, id: this.selection.id },
          { selected: false }
        );
        this.selection = null;
      }

      if (features.length === 0) {
        infoPanel.style.display = 'none';
        console.log('Click: no feature selected');
        return;
      }

      const feature = features[0];
      const source = feature.source;
      const featureId = feature.id as number;

      console.log(`Click: selected feature id=${featureId} from layer=${source}`);

      this.map.setFeatureState(
        { source, id: featureId },
        { selected: true }
      );
      this.selection = { source, id: featureId };

      // Show info panel
      const props = feature.properties ?? {};
      let html = '';
      html += `<tr><td>Layer</td><td>${source}</td></tr>`;
      for (const [key, value] of Object.entries(props)) {
        if (key === 'id') continue;
        const displayValue = key === 'road_length'
          ? `${Number(value).toFixed(1)} m`
          : String(value);
        html += `<tr><td>${key}</td><td>${displayValue}</td></tr>`;
      }
      infoTable.innerHTML = html;
      infoPanel.style.display = 'block';
    });

    console.log('Click handlers set up for all layers');
  }

  private setupLayerToggles(): void {
    for (const layerId of LAYER_IDS) {
      const checkbox = document.getElementById(`toggle-${layerId}`) as HTMLInputElement | null;
      if (!checkbox) continue;

      checkbox.addEventListener('change', () => {
        const visibility = checkbox.checked ? 'visible' : 'none';
        this.map.setLayoutProperty(layerId, 'visibility', visibility);
        if (layerId === 'roads') {
          this.map.setLayoutProperty('roads-outline', 'visibility', visibility);
        }
        console.log(`Layer ${layerId} visibility: ${visibility}`);
      });
    }
    console.log('Layer toggle controls set up');
  }

  updateLegendMax(maxLength: number): void {
    const el = document.getElementById('legend-max');
    if (el) el.textContent = Math.round(maxLength).toString();
  }
}

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { loadSubwayStations } from './subway';
import { fetchManhattanBuildings } from './buildings';
import { countStationsNearBuilding } from './geo';
import type { SubwayStation } from './subway';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

const MANHATTAN_CENTER: [number, number] = [-73.97, 40.775];

async function main() {
  const loadingEl = document.getElementById('loading')!;
  const loadingText = document.getElementById('loading-text')!;

  const map = new maplibregl.Map({
    container: 'map',
    style: buildStyle(),
    center: MANHATTAN_CENTER,
    zoom: 13.5,
    pitch: 50,
    bearing: -17,
    maxZoom: 18,
    minZoom: 11,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-left');

  await new Promise<void>((resolve) => map.on('load', resolve));

  // Load subway stations
  loadingText.textContent = 'Loading subway stations…';
  const stations = await loadSubwayStations('/subway_manhattan_clean.csv');

  // Add station markers as a source/layer
  const stationGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: stations.map((s) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [s.longitude, s.latitude] },
      properties: { key: s.key },
    })),
  };

  map.addSource('stations', { type: 'geojson', data: stationGeoJSON });
  map.addLayer({
    id: 'station-circles',
    type: 'circle',
    source: 'stations',
    paint: {
      'circle-radius': 5,
      'circle-color': '#e31a1c',
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#fff',
    },
  });

  // Fetch buildings
  loadingText.textContent = 'Fetching Manhattan buildings from Overpass API…';
  const buildingFeatures = await fetchManhattanBuildings();

  // Color buildings by subway proximity
  loadingText.textContent = 'Computing subway proximity for each building…';
  await new Promise((r) => setTimeout(r, 50)); // let UI update

  const coloredFeatures = colorBuildings(buildingFeatures, stations);

  const buildingGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: coloredFeatures,
  };

  map.addSource('buildings-3d', { type: 'geojson', data: buildingGeoJSON });

  map.addLayer(
    {
      id: 'buildings-3d-layer',
      type: 'fill-extrusion',
      source: 'buildings-3d',
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.85,
      },
    },
    'station-circles'
  );

  // Popup on click
  map.on('click', 'buildings-3d-layer', (e) => {
    if (!e.features || e.features.length === 0) return;
    const props = e.features[0].properties;
    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(
        `<strong>Subway stations within 500m:</strong> ${props?.stationCount ?? '?'}<br/>` +
        `<strong>Height:</strong> ${props?.height ?? '?'}m`
      )
      .addTo(map);
  });

  map.on('mouseenter', 'buildings-3d-layer', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'buildings-3d-layer', () => {
    map.getCanvas().style.cursor = '';
  });

  loadingEl.classList.add('hidden');
}

function colorBuildings(
  features: Feature<Polygon | MultiPolygon>[],
  stations: SubwayStation[]
): Feature<Polygon | MultiPolygon>[] {
  return features.map((f) => {
    const count = countStationsNearBuilding(f, stations);
    const color = countToColor(count);
    const height = (f.properties?.height as number) || (f.properties?.levels as number) * 3.5 || 12;
    return {
      ...f,
      properties: {
        ...f.properties,
        stationCount: count,
        color,
        height,
      },
    };
  });
}

function countToColor(count: number): string {
  if (count === 0) return '#f7fbff';
  if (count <= 2) return '#c6dbef';
  if (count <= 4) return '#6baed6';
  if (count <= 7) return '#2171b5';
  return '#08306b';
}

function buildStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: [
      {
        id: 'osm-tiles',
        type: 'raster',
        source: 'osm',
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  };
}

main().catch((err) => {
  console.error('Fatal error:', err);
  const loadingText = document.getElementById('loading-text');
  if (loadingText) {
    loadingText.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
});

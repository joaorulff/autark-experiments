import { SpatialDb } from 'autk-db';
import { AutkMap, LayerType, MapEvent, ColorMapInterpolator } from 'autk-map';

async function main() {
  console.log('Application starting...');

  // ── 1. Initialize database ──
  console.log('Initializing SpatialDb...');
  const db = new SpatialDb();
  await db.init();
  console.log('SpatialDb initialized.');

  // ── 2. Load OSM layers for Manhattan ──
  console.log('Loading OSM layers for Manhattan Island...');
  await db.loadOsmFromOverpassApi({
    queryArea: {
      geocodeArea: 'New York',
      areas: ['Manhattan Island'],
    },
    outputTableName: 'osm',
    autoLoadLayers: {
      coordinateFormat: 'EPSG:3395',
      layers: ['surface', 'parks', 'water', 'roads', 'buildings'],
      dropOsmTable: true,
    },
    onProgress: (phase) => console.log('OSM loading phase:', phase),
  });
  console.log('OSM layers loaded.');

  // ── 3. Load subway station CSV ──
  console.log('Loading subway station CSV...');
  await db.loadCsv({
    csvFileUrl: 'http://localhost:3005/data/subway_manhattan_clean.csv',
    outputTableName: 'subway_stations',
    geometryColumns: {
      latColumnName: 'latitude',
      longColumnName: 'longitude',
      coordinateFormat: 'EPSG:3395',
    },
  });
  console.log('Subway stations loaded.');

  // ── 4. Spatial join: count stations within 500m of each building ──
  console.log('Spatial join started: buildings ↔ subway stations (500m)...');
  await db.spatialJoin({
    tableRootName: 'osm_buildings',
    tableJoinName: 'subway_stations',
    output: { type: 'MODIFY_ROOT' },
    spatialPredicate: 'NEAR',
    nearDistance: 500,
    nearUseCentroid: true,
    joinType: 'LEFT',
    groupBy: {
      selectColumns: [
        {
          tableName: 'subway_stations',
          column: 'key',
          aggregateFn: 'count',
          aggregateFnResultColumnName: 'subway_count',
          normalize: true,
        },
      ],
    },
  });
  console.log('Spatial join complete.');

  // ── 5. Initialize map ──
  console.log('Initializing map renderer...');
  const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;
  const map = new AutkMap(canvas, true);
  await map.init();
  console.log('Map renderer initialized.');

  // ── 6. Load all layers onto the map ──
  const layerTypeMap: Record<string, LayerType> = {
    osm_surface: LayerType.AUTK_OSM_SURFACE,
    osm_parks: LayerType.AUTK_OSM_PARKS,
    osm_water: LayerType.AUTK_OSM_WATER,
    osm_roads: LayerType.AUTK_OSM_ROADS,
    osm_buildings: LayerType.AUTK_OSM_BUILDINGS,
  };

  const layerNames = ['osm_surface', 'osm_parks', 'osm_water', 'osm_roads', 'osm_buildings'];
  for (const name of layerNames) {
    console.log(`Loading layer: ${name}...`);
    const geojson = await db.getLayer(name);
    console.log(`Layer ${name} loaded: ${geojson.features.length} features`);
    map.loadGeoJsonLayer(name, geojson, layerTypeMap[name]);
  }

  // ── 7. Apply thematic coloring to buildings ──
  console.log('Applying thematic coloring to buildings...');
  const buildingsGeoJson = await db.getLayer('osm_buildings');

  map.updateRenderInfoProperty('osm_buildings', 'colorMapInterpolator', ColorMapInterpolator.SEQUENTIAL_REDS);
  map.updateRenderInfoProperty('osm_buildings', 'isColorMap', true);
  map.updateRenderInfoProperty('osm_buildings', 'colorMapLabels', ['0 stations', 'Max stations']);

  map.updateGeoJsonLayerThematic(
    'osm_buildings',
    buildingsGeoJson,
    (feature) => feature.properties?.sjoin?.count?.subway_count_norm ?? 0,
    true,
  );
  console.log('Thematic coloring applied to buildings.');

  // ── 8. Enable picking on all layers ──
  for (const name of layerNames) {
    map.updateRenderInfoProperty(name, 'isPick', true);
  }
  console.log('Picking enabled on all layers: surface, parks, water, roads, buildings.');

  map.mapEvents.addEventListener(MapEvent.PICK, (selectedIds: number[], layerId: string) => {
    if (selectedIds.length > 0) {
      console.log(`Picked ${selectedIds.length} element(s) on layer "${layerId}":`, selectedIds);
    } else {
      console.log(`Deselected on layer "${layerId}".`);
    }
  });

  // ── 9. Start rendering ──
  map.draw();
  console.log('Scene rendered with 5 layers. Application ready.');
}

main().catch((err) => {
  console.error('Application error:', err);
});

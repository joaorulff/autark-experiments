import { SpatialDb } from 'autk-db';
import { AutkMap, LayerType, MapEvent, ColorMapInterpolator } from 'autk-map';

const statusEl = document.getElementById('loading-status')!;
const overlay = document.getElementById('loading-overlay')!;

function setStatus(msg: string) {
  statusEl.textContent = msg;
  console.log(`[status] ${msg}`);
}

async function main() {
  try {
    // ── 1. Initialize database ──────────────────────────────────────
    setStatus('Initializing spatial database...');
    const db = new SpatialDb();
    await db.init();
    console.log('SpatialDb initialized');

    // ── 2. Load OSM layers for Manhattan Island ─────────────────────
    setStatus('Loading OpenStreetMap data for Manhattan Island...');
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
      onProgress: (phase) => {
        console.log(`[OSM progress] ${phase}`);
        setStatus(`OSM: ${phase}`);
      },
    });
    console.log('OSM data loaded successfully');

    const layerTables = db.getLayerTables();
    console.log('Layer tables:', layerTables.map((l) => l.name));

    // ── 3. Load subway station CSV ──────────────────────────────────
    setStatus('Loading subway station data...');
    await db.loadCsv({
      csvFileUrl: 'http://localhost:5173/data/subway_manhattan_clean.csv',
      outputTableName: 'subway_stations',
      delimiter: ',',
      geometryColumns: {
        latColumnName: 'latitude',
        longColumnName: 'longitude',
        coordinateFormat: 'EPSG:3395',
      },
    });
    console.log('Subway station CSV loaded');

    // ── 4. Spatial join: count subway stations within 500m of each building ──
    setStatus('Running spatial join (buildings ↔ subway stations, 500m)...');
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
            aggregateFnResultColumnName: 'subway_count'
          },
        ],
      },
    });
    console.log('Spatial join complete');

    // ── 5. Initialize the 3D map ────────────────────────────────────
    setStatus('Initializing 3D map renderer...');
    const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;
    const map = new AutkMap(canvas, true);
    await map.init();
    console.log('AutkMap initialized');

    // ── 6. Load all OSM layers into the map ─────────────────────────
    setStatus('Loading layers into map...');
    for (const layer of db.getLayerTables()) {
      // Skip the subway_stations point layer from map rendering
      if (layer.name === 'subway_stations') continue;

      const geojson = await db.getLayer(layer.name);
      const featureCount = geojson.features?.length ?? 0;
      console.log(`Loading layer "${layer.name}" (type: ${layer.type}, features: ${featureCount})`);
      map.loadGeoJsonLayer(layer.name, geojson, layer.type as LayerType);
    }
    console.log('All layers loaded into map');

    // ── 7. Apply thematic coloring to buildings ─────────────────────
    setStatus('Applying subway accessibility coloring...');
    const buildingsGeoJson = await db.getLayer('osm_buildings');
    console.log(`Buildings for thematic: ${buildingsGeoJson.features?.length ?? 0} features`);

    map.updateRenderInfoProperty('osm_buildings', 'colorMapInterpolator', ColorMapInterpolator.SEQUENTIAL_REDS);
    map.updateRenderInfoProperty('osm_buildings', 'isColorMap', true);
    map.updateRenderInfoProperty('osm_buildings', 'colorMapLabels', ['0 stations', 'Max stations']);

    map.updateGeoJsonLayerThematic(
      'osm_buildings',
      buildingsGeoJson,
      (feature) => {
        const sjoin = feature.properties?.sjoin;
        if (!sjoin) return 0;
        const countObj = sjoin.count;
        if (!countObj) return 0;
        return countObj.subway_count_norm ?? countObj.subway_count ?? 0;
      },
      true,
    );
    console.log('Thematic coloring applied to buildings');

    // ── 8. Enable picking on all visible layers ─────────────────────
    setStatus('Enabling layer picking...');
    const pickableLayers = ['osm_surface', 'osm_parks', 'osm_water', 'osm_roads', 'osm_buildings'];
    for (const layerName of pickableLayers) {
      map.updateRenderInfoProperty(layerName, 'isPick', true);
      console.log(`Picking enabled for "${layerName}"`);
    }

    map.mapEvents.addEventListener(MapEvent.PICK, (selectedIds: number[], layerId: string) => {
      if (selectedIds.length > 0) {
        console.log(`[PICK] Layer: "${layerId}", selected IDs:`, selectedIds);
      } else {
        console.log(`[PICK] Deselected on layer: "${layerId}"`);
      }
    });
    console.log('Pick event listener registered');

    // ── 9. Start rendering ──────────────────────────────────────────
    map.draw();
    console.log('Render loop started');

    // Hide the loading overlay
    overlay.style.display = 'none';
    setStatus('Done');
    console.log('Application fully loaded');
  } catch (err) {
    console.error('Application error:', err);
    setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main();

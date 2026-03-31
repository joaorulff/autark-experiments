import { SpatialDb } from 'autk-db';
import { AutkMap, LayerType, MapEvent, ColorMapInterpolator } from 'autk-map';
import { Scatterplot, PlotEvent } from 'autk-plot';

const statusEl = document.getElementById('status') as HTMLElement;
function setStatus(msg: string) {
  statusEl.textContent = msg;
  console.log(`[STATUS] ${msg}`);
}

async function main() {
  try {
    console.log('Application starting...');
    setStatus('Initializing database...');

    // ── 1. Database ──
    const db = new SpatialDb();
    await db.init();
    console.log('Database initialized');

    // ── 2. Load OSM layers for Manhattan Island ──
    setStatus('Loading OSM layers for Manhattan Island...');
    console.log('Fetching Overpass API for Manhattan Island...');

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
      onProgress: (phase: string) => {
        console.log(`OSM loading phase: ${phase}`);
        setStatus(`OSM: ${phase}`);
      },
    });
    console.log('OSM data loaded successfully');

    // ── 3. Load noise CSV ──
    setStatus('Loading noise data...');
    console.log('Loading noise CSV...');

    await db.loadCsv({
      csvFileUrl: 'http://localhost:3005/noise.csv',
      outputTableName: 'noise',
      delimiter: ',',
      geometryColumns: {
        latColumnName: 'Latitude',
        longColumnName: 'Longitude',
        coordinateFormat: 'EPSG:3395',
      },
    });
    console.log('Noise CSV loaded');

    // ── 4. Spatial join: count noise events within 500m of each building ──
    setStatus('Running spatial join (noise within 500m of buildings)...');
    console.log('Spatial join started...');

    await db.spatialJoin({
      tableRootName: 'osm_buildings',
      tableJoinName: 'noise',
      output: { type: 'MODIFY_ROOT' },
      spatialPredicate: 'NEAR',
      nearDistance: 500,
      nearUseCentroid: true,
      joinType: 'LEFT',
      groupBy: {
        selectColumns: [
          {
            tableName: 'noise',
            column: 'Unique Key',
            aggregateFn: 'count',
            aggregateFnResultColumnName: 'noise_count',
            normalize: true,
          },
        ],
      },
    });
    console.log('Spatial join complete');

    // ── 5. Initialize map ──
    setStatus('Initializing 3D map...');
    console.log('Initializing renderer...');

    const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;
    const map = new AutkMap(canvas, true);
    await map.init();
    console.log('Map renderer initialized');

    // ── 6. Load all layers into the map ──
    const layerTables = db.getLayerTables();
    console.log(`Loading ${layerTables.length} layers into map...`);

    for (const layer of layerTables) {
      const geojson = await db.getLayer(layer.name);
      const featureCount = geojson.features ? geojson.features.length : 0;
      console.log(`Layer "${layer.name}" loaded: ${featureCount} features`);
      map.loadGeoJsonLayer(layer.name, geojson, layer.type as LayerType);
    }

    // ── 7. Enable picking on all OSM layers ──
    const pickableLayers = ['osm_surface', 'osm_parks', 'osm_water', 'osm_roads', 'osm_buildings'];
    for (const layerName of pickableLayers) {
      map.updateRenderInfoProperty(layerName, 'isPick', true);
    }
    console.log('Picking enabled on all OSM layers');

    map.mapEvents.addEventListener(MapEvent.PICK, (selectedIds: number[], layerId: string) => {
      console.log(`Picked on layer "${layerId}":`, selectedIds);
    });

    // ── 8. Thematic coloring: buildings by noise count ──
    const buildingsGeojson = await db.getLayer('osm_buildings');
    console.log(`OSM buildings loaded: ${buildingsGeojson.features.length} features`);

    map.updateRenderInfoProperty('osm_buildings', 'colorMapInterpolator', ColorMapInterpolator.SEQUENTIAL_REDS);
    map.updateRenderInfoProperty('osm_buildings', 'isColorMap', true);

    map.updateGeoJsonLayerThematic(
      'osm_buildings',
      buildingsGeojson,
      (f) => (f as any).properties?.sjoin?.count?.noise_count ?? 0,
      true,
    );
    console.log('Thematic coloring applied to buildings');

    // ── 9. Compute building area for scatterplot ──
    setStatus('Preparing scatterplot data...');

    const areaData = await db.rawQuery({
      query: `SELECT ST_Area(geometry) as building_area FROM osm_buildings`,
      output: { type: 'RETURN_OBJECT' },
    }) as Record<string, unknown>[];
    console.log(`Building area data retrieved: ${areaData.length} rows`);

    // Enrich GeoJSON with noise_count and area as top-level properties for the plot
    const plotFeatures = buildingsGeojson.features.map((f: any, i: number) => ({
      ...f,
      properties: {
        ...f.properties,
        noise_count: f.properties?.sjoin?.count?.noise_count ?? 0,
        building_area: areaData[i] ? Number((areaData[i] as any).building_area) : 0,
      },
    }));

    const plotGeojson = {
      type: 'FeatureCollection' as const,
      features: plotFeatures,
    };
    console.log(`Scatterplot data prepared: ${plotFeatures.length} buildings`);

    // ── 10. Create scatterplot ──
    const chartDiv = document.getElementById('chart-container') as HTMLElement;

    const scatterplot = new Scatterplot({
      div: chartDiv,
      data: plotGeojson as any,
      events: [PlotEvent.BRUSH],
      labels: {
        axis: ['noise_count', 'building_area'],
        title: 'Noise Complaints vs Building Area',
      },
      width: 400,
      height: 350,
    });
    console.log('Scatterplot created');

    // ── 11. Brushing: scatterplot → map highlighting ──
    scatterplot.plotEvents.addEventListener(PlotEvent.BRUSH, (selectedIds: number[]) => {
      console.log(`Brush selection: ${selectedIds.length} buildings`);
      scatterplot.setHighlightedIds(selectedIds);

      // Highlight selected buildings on map
      map.updateGeoJsonLayerThematic(
        'osm_buildings',
        buildingsGeojson,
        (f) => {
          if (selectedIds.length === 0) {
            return (f as any).properties?.sjoin?.count?.noise_count ?? 0;
          }
          const idx = buildingsGeojson.features.indexOf(f);
          return selectedIds.includes(idx) ? 1.0 : 0.0;
        },
        true,
      );
    });

    // ── 12. Start rendering ──
    map.draw();
    console.log('Scene rendered with all layers');
    setStatus('Ready');

  } catch (err) {
    console.error('Application error:', err);
    setStatus(`Error: ${err}`);
  }
}

main();

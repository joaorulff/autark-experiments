import { SpatialDb } from 'autk-db';
import { AutkMap, LayerType, MapEvent, ColorMapInterpolator } from 'autk-map';
import { Scatterplot, PlotEvent } from 'autk-plot';

const statusDiv = document.getElementById('status') as HTMLElement;

function log(msg: string) {
  console.log(msg);
  const p = document.createElement('p');
  p.textContent = msg;
  statusDiv.appendChild(p);
  statusDiv.scrollTop = statusDiv.scrollHeight;
}

async function main() {
  try {
    // ── 1. Initialize database ──────────────────────────────────────
    log('Initializing SpatialDb...');
    const db = new SpatialDb();
    await db.init();
    log('SpatialDb initialized.');

    // ── 2. Load OSM layers for Manhattan ────────────────────────────
    log('Loading OSM layers for Manhattan Island...');
    await db.loadOsmFromOverpassApi({
      queryArea: {
        geocodeArea: 'New York',
        areas: ['Manhattan Island']
      },
      outputTableName: 'osm',
      autoLoadLayers: {
        coordinateFormat: 'EPSG:3395',
        layers: ['surface', 'parks', 'water', 'roads', 'buildings'],
        dropOsmTable: true
      },
      onProgress: (phase) => log(`OSM progress: ${phase}`)
    });
    log('OSM layers loaded.');

    // Log layer stats
    for (const layer of db.getLayerTables()) {
      const geojson = await db.getLayer(layer.name);
      log(`Layer "${layer.name}": ${geojson.features.length} features`);
    }

    // ── 3. Load noise CSV ───────────────────────────────────────────
    log('Loading noise CSV...');
    await db.loadCsv({
      csvFileUrl: '/noise.csv',
      outputTableName: 'noise',
      delimiter: ',',
      geometryColumns: {
        latColumnName: 'Latitude',
        longColumnName: 'Longitude',
        coordinateFormat: 'EPSG:3395'
      }
    });
    const noiseData = await db.getTableData({ tableName: 'noise' });
    log(`Noise data loaded: ${noiseData.length} records`);

    // ── 4. Spatial join: count noise events within 500m of each building ─
    log('Spatial join started: buildings ↔ noise (500m radius)...');
    await db.spatialJoin({
      tableRootName: 'osm_buildings',
      tableJoinName: 'noise',
      output: { type: 'MODIFY_ROOT' },
      spatialPredicate: 'NEAR',
      joinType: 'LEFT',
      nearDistance: 500,
      nearUseCentroid: true,
      groupBy: {
        selectColumns: [
          {
            tableName: 'noise',
            column: 'Unique Key',
            aggregateFn: 'count',
            aggregateFnResultColumnName: 'noise_count',
            normalize: true
          }
        ]
      }
    });
    log('Spatial join complete.');

    // ── 5. Get enriched buildings ───────────────────────────────────
    log('Computing building areas...');
    await db.rawQuery({
      query: `ALTER TABLE osm_buildings ADD COLUMN IF NOT EXISTS building_area DOUBLE`,
      output: { type: 'RETURN_OBJECT' }
    });
    await db.rawQuery({
      query: `UPDATE osm_buildings SET building_area = ST_Area(geometry)`,
      output: { type: 'RETURN_OBJECT' }
    });

    const buildingsGeojson = await db.getLayer('osm_buildings');
    log(`Buildings with noise data: ${buildingsGeojson.features.length} features`);

    // Prepare properties at top level for plot and thematic mapping
    let matched = 0;
    const selectedSet = new Set<number>();
    for (let i = 0; i < buildingsGeojson.features.length; i++) {
      const f = buildingsGeojson.features[i];
      const props = f.properties as Record<string, unknown>;
      const sjoin = props?.sjoin as Record<string, Record<string, number>> | undefined;
      const noiseCount = sjoin?.count?.noise_count ?? 0;
      const noiseNorm = sjoin?.count?.noise_count_norm ?? 0;
      props['noise_complaints'] = noiseCount;
      props['noise_norm'] = noiseNorm;
      props['area'] = props['building_area'] ?? 0;
      props['_index'] = i;
      if (noiseCount > 0) matched++;
    }
    log(`Buildings with at least 1 noise event nearby: ${matched}`);

    // ── 6. Initialize map ───────────────────────────────────────────
    log('Initializing map renderer...');
    const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;
    const map = new AutkMap(canvas);
    await map.init();
    log('Map renderer initialized.');

    // ── 7. Load all layers into map ─────────────────────────────────
    const layerTypeMap: Record<string, LayerType> = {
      'osm_surface': LayerType.AUTK_OSM_SURFACE,
      'osm_parks': LayerType.AUTK_OSM_PARKS,
      'osm_water': LayerType.AUTK_OSM_WATER,
      'osm_roads': LayerType.AUTK_OSM_ROADS,
      'osm_buildings': LayerType.AUTK_OSM_BUILDINGS
    };

    for (const layer of db.getLayerTables()) {
      if (layerTypeMap[layer.name]) {
        const geojson = await db.getLayer(layer.name);
        map.loadGeoJsonLayer(layer.name, geojson, layerTypeMap[layer.name]);
        log(`Map layer loaded: ${layer.name}`);
      }
    }

    // ── 8. Enable picking on all layers ─────────────────────────────
    for (const layerName of Object.keys(layerTypeMap)) {
      map.updateRenderInfoProperty(layerName, 'isPick', true);
    }
    log('Picking enabled on all layers.');

    // ── 9. Apply thematic coloring to buildings ─────────────────────
    map.updateRenderInfoProperty('osm_buildings', 'colorMapInterpolator', ColorMapInterpolator.SEQUENTIAL_REDS);
    map.updateRenderInfoProperty('osm_buildings', 'isColorMap', true);
    map.updateRenderInfoProperty('osm_buildings', 'colorMapLabels', ['0 noise', 'Max noise']);

    map.updateGeoJsonLayerThematic(
      'osm_buildings',
      buildingsGeojson,
      (feature) => {
        const props = feature.properties as Record<string, unknown>;
        return (props['noise_norm'] as number) ?? 0;
      },
      true
    );
    log('Thematic coloring applied to buildings based on noise count.');

    // ── 10. Start rendering ─────────────────────────────────────────
    map.draw(60);
    log('Scene rendered with all layers.');

    // ── 11. Handle picking events ───────────────────────────────────
    map.mapEvents.addEventListener(MapEvent.PICK, (selectedIds: number[], layerId: string) => {
      if (selectedIds.length > 0) {
        log(`Picked ${selectedIds.length} element(s) on layer "${layerId}"`);
      } else {
        log(`Deselected on layer "${layerId}"`);
      }
      if (layerId === 'osm_buildings') {
        scatterplot.setHighlightedIds(selectedIds);
      }
    });

    // ── 12. Create scatterplot ──────────────────────────────────────
    log('Creating scatterplot...');

    const chartDiv = document.getElementById('chart-container') as HTMLElement;
    const scatterplot = new Scatterplot({
      div: chartDiv,
      data: buildingsGeojson,
      events: [PlotEvent.BRUSH],
      labels: {
        axis: ['noise_complaints', 'area'],
        title: 'Noise Complaints vs Building Area'
      },
      width: 400,
      height: 370
    });
    log('Scatterplot created.');

    // ── 13. Linked views: brush → map highlight ─────────────────────
    scatterplot.plotEvents.addEventListener(PlotEvent.BRUSH, (selectedIds: number[]) => {
      log(`Brushed ${selectedIds.length} buildings in scatterplot.`);
      scatterplot.setHighlightedIds(selectedIds);

      // Mark selected features for thematic callback
      selectedSet.clear();
      for (const id of selectedIds) {
        selectedSet.add(id);
      }

      if (selectedIds.length === 0) {
        // Reset to noise norm coloring
        map.updateGeoJsonLayerThematic(
          'osm_buildings',
          buildingsGeojson,
          (feature) => {
            const props = feature.properties as Record<string, unknown>;
            return (props['noise_norm'] as number) ?? 0;
          },
          true
        );
      } else {
        // Highlight selected buildings
        map.updateGeoJsonLayerThematic(
          'osm_buildings',
          buildingsGeojson,
          (feature) => {
            const props = feature.properties as Record<string, unknown>;
            const idx = props['_index'] as number;
            return selectedSet.has(idx) ? 1.0 : 0.0;
          },
          true
        );
      }
    });

    log('Application fully loaded and interactive.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`ERROR: ${message}`);
    console.error(err);
  }
}

main();

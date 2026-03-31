import { SpatialDb } from "autk-db";
import { AutkMap, LayerType, ColorMapInterpolator } from "autk-map";

function setPhase(text: string) {
  const el = document.getElementById("phase");
  if (el) el.textContent = text;
  console.log(`[Phase] ${text}`);
}

async function main() {
  const canvas = document.getElementById("map-canvas") as HTMLCanvasElement;

  // ── 1. Initialize spatial database ──
  setPhase("Initializing spatial database...");
  const db = new SpatialDb();
  await db.init();
  console.log("SpatialDb initialized");

  // ── 2. Load OSM data for Manhattan Island ──
  setPhase("Loading OSM data for Manhattan Island...");
  console.log("Fetching Overpass API for Manhattan Island...");

  await db.loadOsmFromOverpassApi({
    queryArea: {
      geocodeArea: "New York",
      areas: ["Manhattan Island"],
    },
    outputTableName: "osm",
    autoLoadLayers: {
      coordinateFormat: "EPSG:3395",
      layers: ["surface", "parks", "water", "roads", "buildings"],
      dropOsmTable: true,
    },
    onProgress: (phase: string) => {
      setPhase(`OSM: ${phase}`);
      console.log(`Overpass progress: ${phase}`);
    },
  });

  console.log("OSM data loaded successfully");

  // Log layer info
  const layerTables = db.getLayerTables();
  console.log(`Loaded ${layerTables.length} OSM layers:`, layerTables.map((l) => l.name));

  // ── 3. Load subway station CSV ──
  setPhase("Loading subway station data...");
  console.log("Loading subway CSV from /data/subway_manhattan_clean.csv");

  await db.loadCsv({
    csvFileUrl: "http://localhost:3005/data/subway_manhattan_clean.csv",
    outputTableName: "subway_stations",
    delimiter: ",",
    geometryColumns: {
      latColumnName: "latitude",
      longColumnName: "longitude",
      coordinateFormat: "EPSG:3395",
    },
  });

  const stationData = await db.getTableData({ tableName: "subway_stations" });
  console.log(`Subway stations loaded: ${stationData.length} stations`);

  // ── 4. Spatial join: count subway stations within 500m of each building ──
  setPhase("Spatial join: counting subway stations within 500m of each building...");
  console.log("Spatial join started...");

  await db.spatialJoin({
    tableRootName: "osm_buildings",
    tableJoinName: "subway_stations",
    output: { type: "MODIFY_ROOT" },
    spatialPredicate: "NEAR",
    joinType: "LEFT",
    nearDistance: 500,
    nearUseCentroid: true,
    groupBy: {
      selectColumns: [
        {
          tableName: "subway_stations",
          column: "key",
          aggregateFn: "count",
          aggregateFnResultColumnName: "subway_count",
          normalize: false,
        },
      ],
    },
  });

  console.log("Spatial join complete");

  // Get the enriched buildings layer
  const buildingsGeojson = await db.getLayer("osm_buildings");
  console.log(
    `Buildings with subway data: ${buildingsGeojson.features.length} features`
  );

  // Log some stats about subway counts
  const counts = buildingsGeojson.features.map(
    (f) => f.properties?.sjoin?.count?.subway_count ?? 0
  );
  const maxCount = Math.max(...counts);
  const avgCount = counts.reduce((a: number, b: number) => a + b, 0) / counts.length;
  console.log(`Subway count stats — max: ${maxCount}, avg: ${avgCount.toFixed(2)}`);

  // ── 5. Initialize map renderer ──
  setPhase("Initializing 3D map renderer...");
  console.log("Initializing AutkMap...");

  const map = new AutkMap(canvas);
  await map.init();
  console.log("AutkMap initialized");

  // ── 6. Load all OSM layers onto the map ──
  setPhase("Loading layers onto map...");

  const layerTypeMap: Record<string, LayerType> = {
    osm_surface: LayerType.AUTK_OSM_SURFACE,
    osm_parks: LayerType.AUTK_OSM_PARKS,
    osm_water: LayerType.AUTK_OSM_WATER,
    osm_roads: LayerType.AUTK_OSM_ROADS,
    osm_buildings: LayerType.AUTK_OSM_BUILDINGS,
  };

  for (const layer of layerTables) {
    const geojson = layer.name === "osm_buildings"
      ? buildingsGeojson
      : await db.getLayer(layer.name);
    const type = layerTypeMap[layer.name] ?? (layer.type as LayerType);
    map.loadGeoJsonLayer(layer.name, geojson, type);
    console.log(`Layer "${layer.name}" loaded (${geojson.features.length} features)`);
  }

  // ── 7. Apply thematic coloring to buildings ──
  setPhase("Applying subway accessibility coloring...");
  console.log("Applying thematic coloring based on subway station count...");

  map.updateRenderInfoProperty(
    "osm_buildings",
    "colorMapInterpolator",
    ColorMapInterpolator.SEQUENTIAL_REDS
  );
  map.updateRenderInfoProperty("osm_buildings", "isColorMap", true);
  map.updateRenderInfoProperty(
    "osm_buildings",
    "colorMapLabels",
    ["0 stations", `${maxCount} stations`]
  );

  map.updateGeoJsonLayerThematic(
    "osm_buildings",
    buildingsGeojson,
    (feature) => feature.properties?.sjoin?.count?.subway_count ?? 0,
    true
  );

  console.log("Thematic coloring applied successfully");

  // ── 8. Start rendering ──
  map.draw();
  console.log("Scene rendered with all layers");

  // Hide loading overlay
  const loadingEl = document.getElementById("loading");
  if (loadingEl) loadingEl.style.display = "none";

  setPhase("Done");
  console.log("Application fully loaded and rendering");
}

main().catch((err) => {
  console.error("Application error:", err);
  setPhase(`Error: ${err.message}`);
});

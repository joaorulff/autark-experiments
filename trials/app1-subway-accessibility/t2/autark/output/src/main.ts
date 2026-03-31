import { SpatialDb } from "autk-db";
import { AutkMap, LayerType, ColorMapInterpolator } from "autk-map";

// ── UI helpers ──────────────────────────────────────────────────────────────

function setPhase(text: string): void {
  const el = document.getElementById("phase");
  if (el) el.textContent = text;
  console.log(`[Phase] ${text}`);
}

function setStat(id: string, value: string | number): void {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

// ── Main application ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const canvas = document.getElementById("map-canvas") as HTMLCanvasElement;

  // ── 1. Initialize spatial database ──────────────────────────────────────
  console.log("Initializing SpatialDb...");
  setPhase("Initializing spatial database...");

  const db = new SpatialDb();
  await db.init();
  console.log("SpatialDb initialized");

  // ── 2. Load OSM data for Manhattan Island ────────────────────────────────
  console.log("Loading OSM layers for Manhattan Island...");
  setPhase("Fetching OpenStreetMap data for Manhattan Island...");

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
      const label = phase.replace(/-/g, " ");
      setPhase(`OSM: ${label}`);
      console.log(`Overpass progress: ${phase}`);
    },
  });

  const layerTables = db.getLayerTables();
  console.log(
    `OSM layers loaded: ${layerTables.length} layers — ${layerTables.map((l) => l.name).join(", ")}`
  );

  // ── 3. Load subway station CSV ───────────────────────────────────────────
  console.log("Loading subway station data from CSV...");
  setPhase("Loading subway station data...");

  await db.loadCsv({
    csvFileUrl: "http://localhost:3005/subway_manhattan_clean.csv",
    outputTableName: "subway_stations",
    delimiter: ",",
    geometryColumns: {
      latColumnName: "latitude",
      longColumnName: "longitude",
      coordinateFormat: "EPSG:3395",
    },
  });

  const stationRows = await db.getTableData({ tableName: "subway_stations" });
  console.log(`Subway stations loaded: ${stationRows.length} stations`);

  // ── 4. Spatial join: count stations within 500m of each building ─────────
  console.log("Spatial join started: counting subway stations within 500m of each building...");
  setPhase("Counting subway stations within 500m of each building...");

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
          aggregateFnResultColumnName: "subway_count"
        },
      ],
    },
  });

  console.log("Spatial join complete: buildings enriched with subway station counts");

  // ── 5. Retrieve enriched buildings layer ─────────────────────────────────
  const buildingsGeojson = await db.getLayer("osm_buildings");
  console.log(`OSM buildings loaded: ${buildingsGeojson.features.length} features`);

  // Compute stats over subway counts
  const counts: number[] = buildingsGeojson.features.map((f) => {
    const props = f.properties ?? {};
    // The spatialJoin groupBy result may be nested or at the top level
    const val =
      props["subway_count"] ??
      props?.["sjoin"]?.["count"]?.["subway_count"] ??
      0;
    return typeof val === "number" ? val : Number(val) || 0;
  });

  const maxCount = counts.length > 0 ? Math.max(...counts) : 0;
  const totalCount = counts.reduce((a, b) => a + b, 0);
  const avgCount = counts.length > 0 ? totalCount / counts.length : 0;

  console.log(
    `Spatial join complete: ${buildingsGeojson.features.length} buildings matched — max: ${maxCount}, avg: ${avgCount.toFixed(2)}`
  );

  // Update UI stats
  setStat("stat-buildings", buildingsGeojson.features.length.toLocaleString());
  setStat("stat-stations", stationRows.length);
  setStat("stat-max", maxCount);
  setStat("stat-avg", avgCount.toFixed(2));

  // ── 6. Initialize map renderer ───────────────────────────────────────────
  console.log("Initializing renderer...");
  setPhase("Initializing 3D renderer...");

  const map = new AutkMap(canvas);
  await map.init();
  console.log("AutkMap initialized");

  // ── 7. Load all OSM layers onto the map ─────────────────────────────────
  console.log("Loading layers onto map...");
  setPhase("Loading map layers...");

  const layerTypeMap: Record<string, LayerType> = {
    osm_surface: LayerType.AUTK_OSM_SURFACE,
    osm_parks: LayerType.AUTK_OSM_PARKS,
    osm_water: LayerType.AUTK_OSM_WATER,
    osm_roads: LayerType.AUTK_OSM_ROADS,
    osm_buildings: LayerType.AUTK_OSM_BUILDINGS,
  };

  let layerCount = 0;
  for (const layer of layerTables) {
    const geojson =
      layer.name === "osm_buildings"
        ? buildingsGeojson
        : await db.getLayer(layer.name);
    const type = layerTypeMap[layer.name] ?? (layer.type as LayerType);
    map.loadGeoJsonLayer(layer.name, geojson, type);
    layerCount++;
    console.log(`Layer "${layer.name}" loaded: ${geojson.features.length} features`);
  }

  console.log(`Scene rendered with ${layerCount} layers`);

  // ── 8. Apply thematic coloring based on subway station count ─────────────
  console.log("Applying subway accessibility thematic coloring...");
  setPhase("Applying subway accessibility coloring...");

  map.updateRenderInfoProperty(
    "osm_buildings",
    "colorMapInterpolator",
    ColorMapInterpolator.SEQUENTIAL_REDS
  );
  map.updateRenderInfoProperty("osm_buildings", "isColorMap", true);

  map.updateGeoJsonLayerThematic(
    "osm_buildings",
    buildingsGeojson,
    (feature) => {
      const props = feature.properties ?? {};
      const val =
        props["subway_count"] ??
        props?.["sjoin"]?.["count"]?.["subway_count"] ??
        0;
      return typeof val === "number" ? val : Number(val) || 0;
    },
    true // groupById — required for buildings
  );

  map.updateRenderInfoProperty("osm_buildings", "colorMapLabels", [
    "0 stations",
    `${maxCount} stations`,
  ]);

  console.log("Thematic coloring applied: buildings colored by subway station proximity");

  // ── 9. Start render loop ─────────────────────────────────────────────────
  map.draw();
  console.log("Render loop started at 60fps");

  // ── 10. Show UI overlays, hide loading screen ────────────────────────────
  const loadingEl = document.getElementById("loading");
  if (loadingEl) loadingEl.style.display = "none";

  const legendEl = document.getElementById("legend");
  if (legendEl) legendEl.style.display = "block";

  const statsEl = document.getElementById("stats");
  if (statsEl) statsEl.style.display = "block";

  const legendMax = document.getElementById("legend-max");
  if (legendMax) legendMax.textContent = `${maxCount} stations`;

  console.log("Application fully loaded and rendering");
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("Application error:", err);
  setPhase(`Error: ${msg}`);
});

import { SpatialDb } from "autk-db";
import { AutkMap, LayerType, MapEvent, ColorMapInterpolator } from "autk-map";
import type { Feature } from "geojson";

const statusEl = document.getElementById("status")!;
const loadingEl = document.getElementById("loading")!;

function setStatus(msg: string) {
  statusEl.textContent = msg;
  console.log(`[status] ${msg}`);
}

async function main() {
  try {
    // ── 1. Initialize database ──────────────────────────────────
    setStatus("Initializing database...");
    const db = new SpatialDb();
    await db.init();
    console.log("Database initialized");

    // ── 2. Load OSM data for Manhattan Island ───────────────────
    setStatus("Loading OSM data for Manhattan Island...");
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
      onProgress: (phase) => {
        console.log(`[OSM progress] ${phase}`);
        setStatus(`OSM: ${phase}`);
      },
    });
    console.log("OSM data loaded successfully");

    // Log layer info
    const layerTables = db.getLayerTables();
    for (const lt of layerTables) {
      console.log(`Layer table: ${lt.name}, type: ${lt.type}`);
    }

    // ── 3. Load noise CSV ───────────────────────────────────────
    setStatus("Loading noise CSV data...");
    await db.loadCsv({
      csvFileUrl: "http://localhost:5173/data/noise.csv",
      outputTableName: "noise",
      geometryColumns: {
        latColumnName: "Latitude",
        longColumnName: "Longitude",
        coordinateFormat: "EPSG:3395",
      },
    });
    console.log("Noise CSV loaded");

    // ── 4. Spatial join: count noise events within 500m of each building ─
    setStatus("Performing spatial join (500m radius)...");
    console.log("Spatial join started...");
    await db.spatialJoin({
      tableRootName: "osm_buildings",
      tableJoinName: "noise",
      output: { type: "MODIFY_ROOT" },
      spatialPredicate: "NEAR",
      joinType: "LEFT",
      nearDistance: 500,
      nearUseCentroid: true,
      groupBy: {
        selectColumns: [
          {
            tableName: "noise",
            column: "Unique Key",
            aggregateFn: "count",
            aggregateFnResultColumnName: "noise_count",
            normalize: true,
          },
        ],
      },
    });
    console.log("Spatial join complete");

    // ── 5. Initialize map ───────────────────────────────────────
    setStatus("Initializing 3D map...");
    const canvas = document.getElementById("map-canvas") as HTMLCanvasElement;
    const map = new AutkMap(canvas, true);
    await map.init();
    console.log("Map initialized");

    // ── 6. Load all layers onto the map ─────────────────────────
    setStatus("Loading layers onto map...");
    const layerOrder: [string, LayerType][] = [
      ["surface", LayerType.AUTK_OSM_SURFACE],
      ["parks", LayerType.AUTK_OSM_PARKS],
      ["water", LayerType.AUTK_OSM_WATER],
      ["roads", LayerType.AUTK_OSM_ROADS],
      ["buildings", LayerType.AUTK_OSM_BUILDINGS],
    ];

    for (const [name, type] of layerOrder) {
      const geojson = await db.getLayer(`osm_${name}`);
      console.log(`Loading layer "${name}": ${geojson.features.length} features`);
      map.loadGeoJsonLayer(name, geojson, type);
    }
    console.log("All layers loaded onto map");

    // ── 7. Apply thematic coloring to buildings ─────────────────
    setStatus("Applying noise thematic coloring...");
    const buildingsGeojson = await db.getLayer("osm_buildings");

    map.updateRenderInfoProperty(
      "buildings",
      "colorMapInterpolator",
      ColorMapInterpolator.SEQUENTIAL_REDS
    );
    map.updateRenderInfoProperty("buildings", "isColorMap", true);
    map.updateRenderInfoProperty("buildings", "colorMapLabels", [
      "Low noise",
      "High noise",
    ]);

    map.updateGeoJsonLayerThematic(
      "buildings",
      buildingsGeojson,
      (feature: Feature) => {
        const sjoin = (feature.properties as Record<string, unknown>)?.sjoin as
          | Record<string, Record<string, number>>
          | undefined;
        return sjoin?.count?.noise_count_norm ?? 0;
      },
      true
    );
    console.log("Thematic coloring applied to buildings");

    // ── 8. Enable picking on all layers ─────────────────────────
    const pickableLayers = ["surface", "parks", "water", "roads", "buildings"];
    for (const layerName of pickableLayers) {
      map.updateRenderInfoProperty(layerName, "isPick", true);
      console.log(`Picking enabled for layer: ${layerName}`);
    }

    map.mapEvents.addEventListener(
      MapEvent.PICK,
      (selectedIds: number[], layerId: string) => {
        if (selectedIds.length > 0) {
          console.log(
            `[Pick] Layer "${layerId}", selected IDs:`,
            selectedIds
          );
        } else {
          console.log(`[Pick] Deselected on layer "${layerId}"`);
        }
      }
    );
    console.log("Pick event listener registered");

    // ── 9. Start render loop ────────────────────────────────────
    map.draw(60);
    console.log("Scene rendered with 5 layers");

    // Hide loading overlay
    loadingEl.classList.add("hidden");
    setStatus("Ready");
    console.log("Application ready");
  } catch (err) {
    console.error("Application error:", err);
    setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main();

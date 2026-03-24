import { SpatialDb } from "autk-db";
import { AutkMap, LayerType, ColorMapInterpolator } from "autk-map";

const statusEl = document.getElementById("loading-status")!;
const loadingEl = document.getElementById("loading")!;

function setStatus(msg: string) {
  statusEl.textContent = msg;
  console.log(msg);
}

async function main() {
  // --- 1. Initialize the spatial database ---
  setStatus("Initializing database...");
  const db = new SpatialDb();
  await db.init();

  // --- 2. Load OSM data for Manhattan neighborhoods ---
  setStatus("Loading OpenStreetMap data for Manhattan (this may take a minute)...");
  await db.loadOsmFromOverpassApi({
    queryArea: {
      geocodeArea: "New York",
      areas: [
        "Financial District",
        "Tribeca",
        "SoHo",
        "Greenwich Village",
        "East Village",
        "Lower East Side",
        "Chelsea",
        "Midtown South",
        "Midtown",
        "Upper West Side",
        "Upper East Side",
        "Harlem",
      ],
    },
    outputTableName: "osm",
    autoLoadLayers: {
      coordinateFormat: "EPSG:3395",
      layers: ["surface", "parks", "water", "roads", "buildings"],
      dropOsmTable: true,
    },
    onProgress: (phase) => {
      setStatus(`OSM: ${phase}`);
    },
  });

  // --- 3. Load subway station CSV ---
  setStatus("Loading subway station data...");
  await db.loadCsv({
    csvFileUrl: "http://localhost:3005/data/subway_manhattan_clean.csv",
    outputTableName: "subway_stations",
    geometryColumns: {
      latColumnName: "latitude",
      longColumnName: "longitude",
      coordinateFormat: "EPSG:3395",
    },
  });

  // --- 4. Spatial join: count subway stations within 500m of each building ---
  setStatus("Computing subway accessibility (spatial join, 500m radius)...");
  await db.spatialJoin({
    tableRootName: "osm_buildings",
    tableJoinName: "subway_stations",
    spatialPredicate: "NEAR",
    nearDistance: 500,
    nearUseCentroid: true,
    output: { type: "MODIFY_ROOT" },
    joinType: "LEFT",
    groupBy: {
      selectColumns: [
        {
          tableName: "subway_stations",
          column: "key",
          aggregateFn: "count",
          normalize: true,
        },
      ],
    },
  });

  // --- 5. Initialize the map ---
  setStatus("Initializing 3D map...");
  const canvas = document.getElementById("map-canvas") as HTMLCanvasElement;
  const map = new AutkMap(canvas);
  await map.init();

  // --- 6. Load all OSM layers onto the map ---
  setStatus("Rendering layers...");
  for (const layer of db.getLayerTables()) {
    const geojson = await db.getLayer(layer.name);
    map.loadGeoJsonLayer(layer.name, geojson, layer.type as LayerType);
  }

  // --- 7. Apply thematic coloring to buildings based on subway count ---
  setStatus("Applying subway accessibility coloring...");
  const buildingsGeojson = await db.getLayer("osm_buildings");

  map.updateRenderInfoProperty(
    "osm_buildings",
    "colorMapInterpolator",
    ColorMapInterpolator.SEQUENTIAL_REDS
  );
  map.updateRenderInfoProperty("osm_buildings", "isColorMap", true);
  map.updateRenderInfoProperty("osm_buildings", "colorMapLabels", [
    "Few stations",
    "Many stations",
  ]);

  map.updateGeoJsonLayerThematic(
    "osm_buildings",
    buildingsGeojson,
    (feature) => {
      return feature.properties?.sjoin?.count?.subway_count ?? 0;
    },
    true
  );

  // --- 8. Start rendering ---
  map.draw();

  // Hide loading overlay
  loadingEl.classList.add("hidden");
  setStatus("Done");
}

main().catch((err) => {
  console.error(err);
  setStatus(`Error: ${err.message}`);
});

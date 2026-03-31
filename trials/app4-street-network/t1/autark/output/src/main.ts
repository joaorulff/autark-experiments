import { SpatialDb } from "autk-db";
import { AutkMap, LayerType, ColorMapInterpolator, MapEvent } from "autk-map";
import { GeojsonCompute } from "autk-compute";
import type { Feature } from "geojson";

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

  // ── 2. Initialize GPU compute ──
  const gpuCompute = new GeojsonCompute();
  console.log("GeojsonCompute initialized");

  // ── 3. Load OSM data for Manhattan Island ──
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
      layers: ["surface", "parks", "water", "roads"],
      dropOsmTable: true,
    },
    onProgress: (phase: string) => {
      setPhase(`OSM: ${phase}`);
      console.log(`Overpass progress: ${phase}`);
    },
  });

  console.log("OSM data loaded successfully");

  const layerTables = db.getLayerTables();
  console.log(
    `Loaded ${layerTables.length} OSM layers:`,
    layerTables.map((l) => l.name)
  );

  // ── 4. Get roads GeoJSON for GPU length computation ──
  setPhase("Computing road segment lengths on GPU...");
  console.log("Retrieving roads layer for GPU computation...");
  const roadsGeojson = await db.getLayer("osm_roads");
  console.log(`Roads loaded: ${roadsGeojson.features.length} features`);

  // ── 5. Prepare road geometry for GPU computation ──
  console.log("Preparing road geometry for GPU shader...");

  let maxCoords = 0;
  for (const feature of roadsGeojson.features) {
    const geom = feature.geometry;
    if (geom.type === "LineString") {
      maxCoords = Math.max(maxCoords, geom.coordinates.length);
    } else if (geom.type === "MultiLineString") {
      let total = 0;
      for (const line of geom.coordinates) {
        total += line.length;
      }
      maxCoords = Math.max(maxCoords, total);
    }
  }

  console.log(`Max coordinate points per road segment: ${maxCoords}`);

  // Add flattened coordinate arrays to properties for GPU access
  for (const feature of roadsGeojson.features) {
    const geom = feature.geometry;
    const xs: number[] = [];
    const ys: number[] = [];

    if (geom.type === "LineString") {
      for (const coord of geom.coordinates) {
        xs.push(coord[0]);
        ys.push(coord[1]);
      }
    } else if (geom.type === "MultiLineString") {
      for (const line of geom.coordinates) {
        for (const coord of line) {
          xs.push(coord[0]);
          ys.push(coord[1]);
        }
      }
    }

    if (!feature.properties) feature.properties = {};
    feature.properties.coords_x = xs;
    feature.properties.coords_y = ys;
    feature.properties.num_coords = xs.length;
  }

  console.log("Geometry prepared, dispatching to GPU...");

  // ── 6. Compute road segment lengths on GPU using shader ──
  const roadsWithLength = await gpuCompute.computeFunctionIntoProperties({
    geojson: roadsGeojson,
    attributes: {
      coords_x: "properties.coords_x",
      coords_y: "properties.coords_y",
      num_coords: "properties.num_coords",
    },
    attributeArrays: {
      coords_x: maxCoords,
      coords_y: maxCoords,
    },
    outputColumnName: "segment_length",
    wglsFunction: `
      var total_length = 0.0;
      let n = u32(num_coords);
      for (var i = 1u; i < n; i++) {
        let dx = coords_x[i] - coords_x[i - 1u];
        let dy = coords_y[i] - coords_y[i - 1u];
        total_length += sqrt(dx * dx + dy * dy);
      }
      return total_length;
    `,
  });

  console.log("GPU computation complete — road segment lengths calculated");

  // Log some stats
  const lengths = roadsWithLength.features.map(
    (f: Feature) => (f.properties?.compute?.segment_length ?? 0) as number
  );
  const maxLength = Math.max(...lengths);
  const avgLength =
    lengths.reduce((a: number, b: number) => a + b, 0) / lengths.length;
  console.log(
    `Road length stats — max: ${maxLength.toFixed(2)}m, avg: ${avgLength.toFixed(2)}m`
  );

  // ── 7. Update database with computed lengths ──
  setPhase("Updating database with computed lengths...");
  console.log("Writing computed lengths back to database...");

  await db.updateTable({
    tableName: "osm_roads",
    data: roadsWithLength,
    strategy: "replace",
  });

  const updatedRoads = await db.getLayer("osm_roads");
  console.log("Database updated with road segment lengths");

  // ── 8. Initialize map renderer ──
  setPhase("Initializing map renderer...");
  console.log("Initializing AutkMap...");

  const map = new AutkMap(canvas);
  await map.init();
  console.log("AutkMap initialized");

  // ── 9. Load all OSM layers onto the map ──
  setPhase("Loading layers onto map...");

  const layerTypeMap: Record<string, LayerType> = {
    osm_surface: LayerType.AUTK_OSM_SURFACE,
    osm_parks: LayerType.AUTK_OSM_PARKS,
    osm_water: LayerType.AUTK_OSM_WATER,
    osm_roads: LayerType.AUTK_OSM_ROADS,
  };

  for (const layer of layerTables) {
    const geojson =
      layer.name === "osm_roads"
        ? updatedRoads
        : await db.getLayer(layer.name);
    const type = layerTypeMap[layer.name] ?? (layer.type as LayerType);
    map.loadGeoJsonLayer(layer.name, geojson, type);
    console.log(
      `Layer "${layer.name}" loaded (${geojson.features.length} features)`
    );
  }

  console.log(`Scene rendered with ${layerTables.length} layers`);

  // ── 10. Apply thematic coloring to roads by segment length ──
  setPhase("Applying road length coloring...");
  console.log("Applying thematic coloring based on road segment length...");

  map.updateRenderInfoProperty(
    "osm_roads",
    "colorMapInterpolator",
    ColorMapInterpolator.SEQUENTIAL_REDS
  );
  map.updateRenderInfoProperty("osm_roads", "isColorMap", true);
  map.updateRenderInfoProperty("osm_roads", "colorMapLabels", [
    "0 m",
    `${maxLength.toFixed(0)} m`,
  ]);

  map.updateGeoJsonLayerThematic(
    "osm_roads",
    updatedRoads,
    (feature: Feature) => (feature.properties?.compute?.segment_length ?? 0) as number
  );

  console.log("Thematic coloring applied to roads by segment length");

  // ── 11. Enable picking on all layers ──
  console.log("Enabling picking on all layers...");
  for (const layer of layerTables) {
    map.updateRenderInfoProperty(layer.name, "isPick", true);
    console.log(`Picking enabled on layer "${layer.name}"`);
  }

  map.mapEvents.addEventListener(
    MapEvent.PICK,
    (selectedIds: number[], layerId: string) => {
      console.log(
        `[Pick] Selected ${selectedIds.length} feature(s) on layer "${layerId}":`,
        selectedIds
      );
    }
  );

  console.log("Pick event listener registered");

  // ── 12. Start rendering ──
  map.draw();
  console.log("Rendering started at 60fps");

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

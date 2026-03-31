import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Papa from 'papaparse';
import { loadAllLayers, GeoFeature, GeoCollection } from './overpass';
import {
  SubwayStation, polygonCentroid, countStationsNearby, subwayCountToColor,
} from './spatial';

// ---- Geo → scene coordinate conversion ----
// Manhattan roughly: lat 40.700–40.880, lon -74.020–-73.907
const CENTER_LAT = 40.785;
const CENTER_LON = -73.965;
const SCALE = 8000; // degree-to-scene-unit scale

function geoToScene(lon: number, lat: number): [number, number] {
  const x = (lon - CENTER_LON) * SCALE * Math.cos((CENTER_LAT * Math.PI) / 180);
  const y = (lat - CENTER_LAT) * SCALE;
  return [x, y];
}

// ---- Status helpers ----
function setStatus(msg: string) {
  const el = document.getElementById('load-status');
  if (el) el.textContent = msg;
  console.log(msg);
}

function hideLoading() {
  const el = document.getElementById('loading');
  if (el) el.style.display = 'none';
}

function showInfo(text: string) {
  const el = document.getElementById('info');
  if (el) { el.style.display = 'block'; el.textContent = text; }
}

// ---- Layer type for picking ----
interface PickableEntry {
  mesh: THREE.Mesh;
  layerName: string;
  feature: GeoFeature;
  originalColor: THREE.Color;
}

const pickables: PickableEntry[] = [];
let selectedEntry: PickableEntry | null = null;
const SELECTED_COLOR = new THREE.Color(0x00ffff);

// ---- Build Three.js scene ----
console.log('Initializing renderer...');
const container = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x1a1a2e);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 0, 60);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.maxPolarAngle = Math.PI / 2.1;
controls.minDistance = 2;
controls.maxDistance = 200;

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(30, 50, 40);
scene.add(dirLight);

// ---- Helper: create mesh for a polygon feature ----
function createPolygonMesh(
  ring: number[][], color: THREE.Color, z: number, height: number, layerName: string, feature: GeoFeature
): THREE.Mesh | null {
  const pts = ring.map(([lon, lat]) => {
    const [x, y] = geoToScene(lon, lat);
    return new THREE.Vector2(x, y);
  });
  if (pts.length < 3) return null;

  const shape = new THREE.Shape(pts);
  let geom: THREE.BufferGeometry;
  if (height > 0) {
    geom = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
    });
    // Rotate so extrusion goes along Z (up)
    geom.rotateX(-Math.PI / 2);
    geom.rotateX(Math.PI / 2);
  } else {
    geom = new THREE.ShapeGeometry(shape);
  }

  const mat = new THREE.MeshStandardMaterial({
    color,
    side: THREE.DoubleSide,
    roughness: 0.7,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.z = z;
  return mesh;
}

function addPickable(mesh: THREE.Mesh, layerName: string, feature: GeoFeature, color: THREE.Color) {
  pickables.push({ mesh, layerName, feature, originalColor: color.clone() });
}

// ---- Build layer geometry ----
function buildSurfaceLayer(data: GeoCollection) {
  console.log('Building surface layer...');
  const group = new THREE.Group();
  for (const f of data.features) {
    const rings = f.geometry.type === 'Polygon'
      ? (f.geometry.coordinates as number[][][])
      : f.geometry.type === 'MultiPolygon'
        ? (f.geometry.coordinates as number[][][][]).flatMap(p => p)
        : [];
    for (const ring of rings) {
      const color = new THREE.Color(0x2a2a3e);
      const mesh = createPolygonMesh(ring, color, -0.1, 0, 'surface', f);
      if (mesh) {
        group.add(mesh);
        addPickable(mesh, 'surface', f, color);
      }
    }
  }
  scene.add(group);
  console.log('Surface layer rendered');
}

function buildParksLayer(data: GeoCollection) {
  console.log('Building parks layer...');
  const group = new THREE.Group();
  for (const f of data.features) {
    const rings = f.geometry.type === 'Polygon'
      ? (f.geometry.coordinates as number[][][])
      : f.geometry.type === 'MultiPolygon'
        ? (f.geometry.coordinates as number[][][][]).flatMap(p => p)
        : [];
    for (const ring of rings) {
      const color = new THREE.Color(0x2e7d32);
      const mesh = createPolygonMesh(ring, color, 0.01, 0, 'parks', f);
      if (mesh) {
        group.add(mesh);
        addPickable(mesh, 'parks', f, color);
      }
    }
  }
  scene.add(group);
  console.log('Parks layer rendered');
}

function buildWaterLayer(data: GeoCollection) {
  console.log('Building water layer...');
  const group = new THREE.Group();
  for (const f of data.features) {
    if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
      const rings = f.geometry.type === 'Polygon'
        ? (f.geometry.coordinates as number[][][])
        : (f.geometry.coordinates as number[][][][]).flatMap(p => p);
      for (const ring of rings) {
        const color = new THREE.Color(0x1565c0);
        const mesh = createPolygonMesh(ring, color, 0.02, 0, 'water', f);
        if (mesh) {
          group.add(mesh);
          addPickable(mesh, 'water', f, color);
        }
      }
    } else if (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString') {
      const lines = f.geometry.type === 'LineString'
        ? [f.geometry.coordinates as number[][]]
        : (f.geometry.coordinates as number[][][]);
      for (const line of lines) {
        const pts = line.map(([lon, lat]) => {
          const [x, y] = geoToScene(lon, lat);
          return new THREE.Vector3(x, y, 0.02);
        });
        if (pts.length < 2) continue;
        const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x1565c0 });
        const lineObj = new THREE.Line(lineGeom, lineMat);
        group.add(lineObj);
      }
    }
  }
  scene.add(group);
  console.log('Water layer rendered');
}

function buildRoadsLayer(data: GeoCollection) {
  console.log('Building roads layer...');
  const group = new THREE.Group();
  for (const f of data.features) {
    const lines = f.geometry.type === 'LineString'
      ? [f.geometry.coordinates as number[][]]
      : f.geometry.type === 'MultiLineString'
        ? (f.geometry.coordinates as number[][][])
        : [];
    for (const line of lines) {
      const pts = line.map(([lon, lat]) => {
        const [x, y] = geoToScene(lon, lat);
        return new THREE.Vector3(x, y, 0.03);
      });
      if (pts.length < 2) continue;
      // Create thin tube for picking capability
      const curve = new THREE.CatmullRomCurve3(pts, false);
      const tubeGeom = new THREE.TubeGeometry(curve, Math.max(pts.length, 4), 0.003, 4, false);
      const color = new THREE.Color(0x616161);
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(tubeGeom, mat);
      group.add(mesh);
      addPickable(mesh, 'roads', f, color);
    }
  }
  scene.add(group);
  console.log('Roads layer rendered');
}

function buildBuildingsLayer(data: GeoCollection, stations: SubwayStation[]) {
  console.log('Building 3D buildings layer...');
  console.log('Spatial join started...');
  const group = new THREE.Group();
  let matched = 0;

  for (const f of data.features) {
    const rings = f.geometry.type === 'Polygon'
      ? (f.geometry.coordinates as number[][][])
      : f.geometry.type === 'MultiPolygon'
        ? (f.geometry.coordinates as number[][][][]).flatMap(p => p)
        : [];
    if (rings.length === 0) continue;
    const outerRing = rings[0];
    const [cLon, cLat] = polygonCentroid(outerRing);
    const count = countStationsNearby(cLat, cLon, stations, 500);
    if (count > 0) matched++;

    const [r, g, b] = subwayCountToColor(count);
    const color = new THREE.Color(r, g, b);

    // Building height: base 0.15, + floors hint
    const levels = parseInt(f.properties['building:levels'] as string, 10);
    const height = (!isNaN(levels) && levels > 0) ? levels * 0.02 : 0.15;

    const mesh = createPolygonMesh(outerRing, color, 0.04, height, 'buildings', f);
    if (mesh) {
      group.add(mesh);
      addPickable(mesh, 'buildings', f, color);
    }
  }

  console.log(`Spatial join complete: ${matched} buildings within 500m of a station`);
  scene.add(group);
  console.log('Buildings layer rendered');
}

// ---- Raycaster for picking ----
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

renderer.domElement.addEventListener('click', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const meshes = pickables.map(p => p.mesh);
  const intersects = raycaster.intersectObjects(meshes, false);

  // Deselect previous
  if (selectedEntry) {
    (selectedEntry.mesh.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial).color.copy(selectedEntry.originalColor);
    selectedEntry = null;
  }

  if (intersects.length > 0) {
    const hitMesh = intersects[0].object as THREE.Mesh;
    const entry = pickables.find(p => p.mesh === hitMesh);
    if (entry) {
      (entry.mesh.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial).color.copy(SELECTED_COLOR);
      selectedEntry = entry;

      const name = entry.feature.properties['name'] || entry.feature.id || 'unnamed';
      showInfo(`Layer: ${entry.layerName} | ${name}`);
      console.log(`Picked: layer=${entry.layerName}, id=${entry.feature.id}, name=${name}`);
    }
  } else {
    const el = document.getElementById('info');
    if (el) el.style.display = 'none';
  }
});

// ---- Window resize ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Animation loop ----
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// ---- Main initialization ----
async function main() {
  try {
    // Load subway CSV
    setStatus('Loading subway station data...');
    const csvResp = await fetch('/subway_manhattan_clean.csv');
    const csvText = await csvResp.text();
    const parsed = Papa.parse<{ key: string; latitude: string; longitude: string }>(csvText, {
      header: true,
      skipEmptyLines: true,
    });
    const stations: SubwayStation[] = parsed.data.map(r => ({
      key: r.key,
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
    }));
    console.log(`Subway stations loaded: ${stations.length}`);

    // Load OSM layers
    setStatus('Loading OSM layers from Overpass API...');
    const layers = await loadAllLayers();

    // Build scene layers
    setStatus('Rendering surface...');
    buildSurfaceLayer(layers.surface);

    setStatus('Rendering parks...');
    buildParksLayer(layers.parks);

    setStatus('Rendering water...');
    buildWaterLayer(layers.water);

    setStatus('Rendering roads...');
    buildRoadsLayer(layers.roads);

    setStatus('Rendering buildings with subway accessibility...');
    buildBuildingsLayer(layers.buildings, stations);

    console.log(`Scene rendered with 5 layers. Total pickable objects: ${pickables.length}`);
    hideLoading();
  } catch (err) {
    console.error('Fatal error during initialization:', err);
    setStatus(`Error: ${err}`);
  }
}

main();

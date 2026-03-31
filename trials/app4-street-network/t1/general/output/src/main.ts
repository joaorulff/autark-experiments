import { fetchManhattanOsmData } from './data/overpassClient';
import { parseOsmData } from './data/osmParser';
import { calculateRoadLengths } from './compute/lengthCalculator';
import { MapManager } from './map/mapManager';

function setStatus(msg: string): void {
  const el = document.getElementById('loading-status');
  if (el) el.textContent = msg;
  console.log(`[Status] ${msg}`);
}

function hideLoading(): void {
  const el = document.getElementById('loading-overlay');
  if (el) el.classList.add('hidden');
}

async function main(): Promise<void> {
  console.log('Manhattan Street Network app starting...');

  try {
    // Step 1: Initialize map
    setStatus('Initializing map...');
    const mapManager = new MapManager();
    await mapManager.onReady();
    console.log('Map ready');

    // Step 2: Fetch OSM data
    setStatus('Loading Manhattan OSM data...');
    const osmData = await fetchManhattanOsmData();

    // Step 3: Parse into GeoJSON layers
    setStatus('Parsing OSM data...');
    const layers = parseOsmData(osmData);

    // Step 4: Calculate road lengths (GPU or CPU)
    setStatus('Calculating road lengths...');
    const lengths = await calculateRoadLengths(layers.roads);

    // Step 5: Inject road_length into features
    let maxLength = 0;
    for (let i = 0; i < layers.roads.features.length; i++) {
      const len = lengths[i];
      layers.roads.features[i].properties.road_length = len;
      if (len > maxLength) maxLength = len;
    }
    // Cap max length for color ramp at 95th percentile to avoid outlier skew
    const sortedLengths = Array.from(lengths).sort((a, b) => a - b);
    const p95 = sortedLengths[Math.floor(sortedLengths.length * 0.95)] ?? maxLength;
    const colorMax = p95 > 0 ? p95 : 2000;

    console.log(`Road lengths — min: ${sortedLengths[0]?.toFixed(1)}m, max: ${maxLength.toFixed(1)}m, p95: ${p95.toFixed(1)}m, colorMax: ${colorMax.toFixed(1)}m`);

    // Step 6: Add layers to map
    setStatus('Rendering layers...');
    mapManager.addLayers(layers, colorMax);
    mapManager.updateLegendMax(colorMax);

    // Done
    hideLoading();
    console.log('Application fully loaded and rendered');

  } catch (err) {
    console.error('Application error:', err);
    setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main();

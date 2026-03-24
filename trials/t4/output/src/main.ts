/**
 * Manhattan Noisescape — Main entry point.
 * Orchestrates data loading, spatial join, map rendering, and scatterplot.
 */

import { loadOSMData } from './osm';
import { loadNoiseData } from './noise';
import { performSpatialJoin, getMaxNoiseCount } from './spatial';
import { initColorScale } from './colors';
import { initMap, highlightBuildings } from './map';
import { createScatterplot, setBrushCallback } from './scatterplot';

function setStatus(msg: string) {
  const el = document.getElementById('loading-status');
  if (el) el.textContent = msg;
}

function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = 'none';
}

async function main() {
  console.log('=== Manhattan Noisescape starting ===');

  try {
    // Load data in parallel
    setStatus('Loading OSM and noise data...');
    console.log('Starting parallel data load...');

    const [osmData, noiseData] = await Promise.all([
      loadOSMData(),
      loadNoiseData(),
    ]);

    // Spatial join: assign noise counts to buildings
    performSpatialJoin(osmData.buildings, noiseData);

    // Initialize color scale
    const maxNoise = getMaxNoiseCount(osmData.buildings);
    initColorScale(maxNoise);

    // Initialize 3D map
    initMap(osmData);

    // Create scatterplot
    createScatterplot(osmData.buildings);

    // Wire up brush → map highlighting
    setBrushCallback((ids: Set<number>) => {
      highlightBuildings(ids);
    });

    hideLoading();
    console.log('=== Manhattan Noisescape fully loaded ===');
  } catch (err) {
    console.error('Fatal error:', err);
    setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main();

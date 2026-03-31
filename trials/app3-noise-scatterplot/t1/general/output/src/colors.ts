/**
 * Color utilities for the noise heatmap.
 */

import { interpolateYlOrRd } from 'd3-scale-chromatic';
import { scaleSequentialSqrt } from 'd3-scale';
import { rgb } from 'd3-color';

let colorScale: (value: number) => string;
let maxNoise = 1;

export function initColorScale(maxNoiseCount: number): void {
  maxNoise = Math.max(maxNoiseCount, 1);
  colorScale = scaleSequentialSqrt(interpolateYlOrRd).domain([0, maxNoise]);
  console.log(`Color scale initialized: domain [0, ${maxNoise}]`);

  // Render legend gradient
  const legendBar = document.getElementById('legend-bar');
  if (legendBar) {
    const stops: string[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      stops.push(colorScale(t * maxNoise));
    }
    legendBar.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
  }
  const legendMax = document.getElementById('legend-max');
  if (legendMax) legendMax.textContent = String(maxNoise);
}

export function getColorForNoise(noiseCount: number): [number, number, number, number] {
  if (!colorScale) return [100, 100, 100, 180];
  const c = rgb(colorScale(noiseCount));
  return [c.r, c.g, c.b, 220];
}

export const SELECTED_COLOR: [number, number, number, number] = [0, 255, 255, 255];
export const HIGHLIGHTED_COLOR: [number, number, number, number] = [255, 255, 0, 240];

export const PARK_COLOR: [number, number, number, number] = [34, 139, 34, 160];
export const PARK_SELECTED: [number, number, number, number] = [0, 255, 255, 255];

export const WATER_COLOR: [number, number, number, number] = [30, 100, 180, 160];
export const WATER_SELECTED: [number, number, number, number] = [0, 255, 255, 255];

export const ROAD_COLOR: [number, number, number, number] = [180, 180, 180, 120];
export const ROAD_SELECTED: [number, number, number, number] = [0, 255, 255, 255];

export const SURFACE_COLOR: [number, number, number, number] = [60, 60, 80, 80];
export const SURFACE_SELECTED: [number, number, number, number] = [0, 255, 255, 255];

/**
 * Color scale for noise complaint counts.
 * Uses a diverging blue-to-red palette.
 */

type RGBA = [number, number, number, number];

const COLOR_STOPS: { threshold: number; color: RGBA }[] = [
  { threshold: 0,  color: [43, 131, 186, 200] },   // blue - no noise
  { threshold: 1,  color: [171, 221, 164, 200] },   // green
  { threshold: 6,  color: [255, 255, 191, 200] },   // yellow
  { threshold: 16, color: [253, 174, 97, 200] },    // orange
  { threshold: 31, color: [215, 25, 28, 200] },     // red
];

export function getColorForCount(count: number): RGBA {
  for (let i = COLOR_STOPS.length - 1; i >= 0; i--) {
    if (count >= COLOR_STOPS[i].threshold) {
      return COLOR_STOPS[i].color;
    }
  }
  return COLOR_STOPS[0].color;
}

export const SELECTED_COLOR: RGBA = [0, 255, 255, 220]; // cyan for selected
export const PARK_COLOR: RGBA = [100, 180, 80, 160];
export const WATER_COLOR: RGBA = [100, 150, 220, 180];
export const ROAD_COLOR: RGBA = [180, 180, 180, 160];
export const SURFACE_COLOR: RGBA = [230, 225, 215, 100];

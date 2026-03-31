export interface SubwayStation {
  key: number;
  latitude: number;
  longitude: number;
}

export const SUBWAY_COLOR_SCALE: [number, string][] = [
  [0, '#313695'],
  [1, '#4575b4'],
  [2, '#74add1'],
  [3, '#abd9e9'],
  [4, '#fee090'],
  [6, '#fdae61'],
  [8, '#f46d43'],
  [10, '#d73027'],
  [13, '#a50026'],
];

export const SELECTED_COLOR = '#ff00ff';

export const LAYER_COLORS = {
  surface: '#e8e4d8',
  parks: '#a8d5a2',
  water: '#7cb7d4',
  roads: '#b0b0b0',
} as const;

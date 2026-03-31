import { scaleLinear } from 'd3-scale';

export function createNoiseColorScale(maxNoise: number) {
  // Yellow-Orange-Red color scale
  const scale = scaleLinear<string>()
    .domain([0, maxNoise * 0.25, maxNoise * 0.5, maxNoise * 0.75, maxNoise])
    .range(['#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026']);

  return (noiseCount: number): [number, number, number, number] => {
    if (noiseCount === 0) return [180, 180, 180, 200];
    const hex = scale(noiseCount);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b, 220];
  };
}

export const SELECTED_COLOR: [number, number, number, number] = [0, 200, 255, 255];
export const HIGHLIGHTED_COLOR: [number, number, number, number] = [255, 255, 0, 255];

import type { ExpressionSpecification } from 'maplibre-gl';

/**
 * Color ramp for road length: short (blue) -> long (red)
 */
export function roadLengthColorExpression(maxLength: number): ExpressionSpecification {
  const q1 = maxLength * 0.1;
  const q2 = maxLength * 0.25;
  const q3 = maxLength * 0.5;
  const q4 = maxLength * 0.75;

  return [
    'interpolate',
    ['linear'],
    ['get', 'road_length'],
    0, '#2166ac',
    q1, '#67a9cf',
    q2, '#d1e5f0',
    q3, '#fddbc7',
    q4, '#ef8a62',
    maxLength, '#b2182b',
  ] as ExpressionSpecification;
}

export const SELECTION_COLOR = '#ffff00';

export const LAYER_COLORS = {
  surface: '#e8e0d0',
  parks: '#b5d99c',
  water: '#a3cce9',
} as const;

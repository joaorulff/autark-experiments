import type { RoadCollection } from '../data/types';
import { gpuCalculateLengths } from './gpuLength';
import { cpuCalculateLengths } from './cpuLength';

/**
 * Calculate road segment lengths using GPU (WebGPU) if available, falling back to CPU.
 * Returns a Float32Array of lengths in meters, one per road feature.
 */
export async function calculateRoadLengths(roads: RoadCollection): Promise<Float32Array> {
  console.log('Starting road length calculation...');

  if (typeof navigator !== 'undefined' && navigator.gpu) {
    try {
      console.log('WebGPU is available, attempting GPU computation...');
      return await gpuCalculateLengths(roads);
    } catch (err) {
      console.warn('WebGPU computation failed, falling back to CPU:', err);
    }
  } else {
    console.log('WebGPU not available, using CPU fallback');
  }

  return cpuCalculateLengths(roads);
}

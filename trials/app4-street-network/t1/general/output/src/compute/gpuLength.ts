import type { RoadCollection } from '../data/types';

const SHADER_SOURCE = `
const PI: f32 = 3.14159265358979323846;
const R: f32 = 6371000.0;

fn to_rad(deg: f32) -> f32 { return deg * PI / 180.0; }

fn haversine(lon1: f32, lat1: f32, lon2: f32, lat2: f32) -> f32 {
    let dlat = to_rad(lat2 - lat1);
    let dlon = to_rad(lon2 - lon1);
    let a = sin(dlat * 0.5) * sin(dlat * 0.5) +
            cos(to_rad(lat1)) * cos(to_rad(lat2)) * sin(dlon * 0.5) * sin(dlon * 0.5);
    let c = 2.0 * atan2(sqrt(a), sqrt(1.0 - a));
    return R * c;
}

@group(0) @binding(0) var<storage, read> coords: array<f32>;
@group(0) @binding(1) var<storage, read> indices: array<u32>;
@group(0) @binding(2) var<storage, read_write> lengths: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= arrayLength(&lengths)) { return; }

    let start = indices[idx * 2u];
    let count = indices[idx * 2u + 1u];

    var total: f32 = 0.0;
    for (var i: u32 = 0u; i < count - 1u; i = i + 1u) {
        let b1 = (start + i) * 2u;
        let b2 = (start + i + 1u) * 2u;
        total = total + haversine(coords[b1], coords[b1 + 1u], coords[b2], coords[b2 + 1u]);
    }
    lengths[idx] = total;
}
`;

export async function gpuCalculateLengths(roads: RoadCollection): Promise<Float32Array> {
  console.log(`GPU length calculation for ${roads.features.length} road segments...`);
  const t0 = performance.now();

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No WebGPU adapter found');
  const device = await adapter.requestDevice();
  console.log('WebGPU device acquired');

  // Flatten coordinates and build index buffer
  const numSegments = roads.features.length;
  let totalPoints = 0;
  for (const f of roads.features) {
    totalPoints += f.geometry.coordinates.length;
  }

  const coordsArray = new Float32Array(totalPoints * 2);
  const indicesArray = new Uint32Array(numSegments * 2);
  let coordOffset = 0;
  let pointOffset = 0;

  for (let i = 0; i < numSegments; i++) {
    const coords = roads.features[i].geometry.coordinates;
    indicesArray[i * 2] = pointOffset;
    indicesArray[i * 2 + 1] = coords.length;
    for (const c of coords) {
      coordsArray[coordOffset++] = c[0]; // lon
      coordsArray[coordOffset++] = c[1]; // lat
    }
    pointOffset += coords.length;
  }

  // Create GPU buffers
  const coordsBuf = device.createBuffer({
    size: coordsArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(coordsBuf, 0, coordsArray);

  const indicesBuf = device.createBuffer({
    size: indicesArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indicesBuf, 0, indicesArray);

  const lengthsBuf = device.createBuffer({
    size: numSegments * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const readbackBuf = device.createBuffer({
    size: numSegments * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // Create compute pipeline
  const shaderModule = device.createShaderModule({ code: SHADER_SOURCE });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: shaderModule, entryPoint: 'main' },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: coordsBuf } },
      { binding: 1, resource: { buffer: indicesBuf } },
      { binding: 2, resource: { buffer: lengthsBuf } },
    ],
  });

  // Dispatch
  const workgroups = Math.ceil(numSegments / 64);
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(workgroups);
  pass.end();
  encoder.copyBufferToBuffer(lengthsBuf, 0, readbackBuf, 0, numSegments * 4);
  device.queue.submit([encoder.finish()]);

  // Read back results
  await readbackBuf.mapAsync(GPUMapMode.READ);
  const result = new Float32Array(readbackBuf.getMappedRange().slice(0));
  readbackBuf.unmap();

  // Cleanup
  coordsBuf.destroy();
  indicesBuf.destroy();
  lengthsBuf.destroy();
  readbackBuf.destroy();
  device.destroy();

  const elapsed = (performance.now() - t0).toFixed(1);
  console.log(`GPU length calculation complete in ${elapsed}ms`);
  return result;
}

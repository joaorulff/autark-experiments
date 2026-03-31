// Spatial utilities: geo math, color scales, centroid computation

export interface SubwayStation {
  key: string;
  latitude: number;
  longitude: number;
}

// Haversine distance in meters
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Compute polygon centroid from a coordinate ring [[lon,lat], ...]
export function polygonCentroid(ring: number[][]): [number, number] {
  let sumLon = 0, sumLat = 0;
  for (const [lon, lat] of ring) {
    sumLon += lon;
    sumLat += lat;
  }
  return [sumLon / ring.length, sumLat / ring.length];
}

// Count stations within radius meters of a point
export function countStationsNearby(
  lat: number, lon: number, stations: SubwayStation[], radiusM: number
): number {
  let count = 0;
  for (const s of stations) {
    if (haversineMeters(lat, lon, s.latitude, s.longitude) <= radiusM) count++;
  }
  return count;
}

// Color scale: 0 stations = dark purple, 5+ = bright yellow
// Interpolates through purple -> red -> orange -> yellow
export function subwayCountToColor(count: number): [number, number, number] {
  const t = Math.min(count / 5, 1);
  // 5-stop gradient: #2c1654, #6a1b9a, #d32f2f, #ff9800, #ffeb3b
  const stops: [number, number, number][] = [
    [0x2c / 255, 0x16 / 255, 0x54 / 255],
    [0x6a / 255, 0x1b / 255, 0x9a / 255],
    [0xd3 / 255, 0x2f / 255, 0x2f / 255],
    [0xff / 255, 0x98 / 255, 0x00 / 255],
    [0xff / 255, 0xeb / 255, 0x3b / 255],
  ];
  const idx = t * (stops.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, stops.length - 1);
  const f = idx - lo;
  return [
    stops[lo][0] + (stops[hi][0] - stops[lo][0]) * f,
    stops[lo][1] + (stops[hi][1] - stops[lo][1]) * f,
    stops[lo][2] + (stops[hi][2] - stops[lo][2]) * f,
  ];
}

declare module 'osmtogeojson' {
  import type { FeatureCollection } from 'geojson';
  function osmtogeojson(data: unknown): FeatureCollection;
  export default osmtogeojson;
}

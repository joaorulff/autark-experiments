import type { Feature, FeatureCollection, LineString, Polygon, MultiPolygon } from 'geojson';
import type { ManhattanLayers, RoadProperties, AreaProperties, RoadCollection, AreaCollection } from './types';

// We use osmtogeojson to handle the complex Overpass JSON -> GeoJSON conversion
// including multipolygon relations
import osmtogeojson from 'osmtogeojson';

export function parseOsmData(osmData: unknown): ManhattanLayers {
  console.log('Parsing OSM data to GeoJSON...');

  const geojson = osmtogeojson(osmData) as FeatureCollection;
  console.log(`osmtogeojson produced ${geojson.features.length} features`);

  const roads: Feature<LineString, RoadProperties>[] = [];
  const parks: Feature<Polygon | MultiPolygon, AreaProperties>[] = [];
  const water: Feature<Polygon | MultiPolygon, AreaProperties>[] = [];
  const surface: Feature<Polygon | MultiPolygon, AreaProperties>[] = [];

  let idCounter = 1;

  for (const feature of geojson.features) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const geomType = feature.geometry?.type;

    if (props['highway'] && (geomType === 'LineString' || geomType === 'MultiLineString')) {
      if (geomType === 'LineString') {
        roads.push({
          type: 'Feature',
          id: idCounter++,
          geometry: feature.geometry as LineString,
          properties: {
            id: idCounter - 1,
            name: props['name'] as string | undefined,
            highway: props['highway'] as string | undefined,
          },
        });
      }
      // Skip MultiLineString roads for simplicity - they're rare
    } else if (props['leisure'] === 'park' && (geomType === 'Polygon' || geomType === 'MultiPolygon')) {
      parks.push({
        type: 'Feature',
        id: idCounter++,
        geometry: feature.geometry as Polygon | MultiPolygon,
        properties: {
          id: idCounter - 1,
          name: props['name'] as string | undefined,
        },
      });
    } else if (props['natural'] === 'water' && (geomType === 'Polygon' || geomType === 'MultiPolygon')) {
      water.push({
        type: 'Feature',
        id: idCounter++,
        geometry: feature.geometry as Polygon | MultiPolygon,
        properties: {
          id: idCounter - 1,
          name: props['name'] as string | undefined,
        },
      });
    } else if (props['landuse'] && (geomType === 'Polygon' || geomType === 'MultiPolygon')) {
      surface.push({
        type: 'Feature',
        id: idCounter++,
        geometry: feature.geometry as Polygon | MultiPolygon,
        properties: {
          id: idCounter - 1,
          name: props['name'] as string | undefined,
          landuse: props['landuse'] as string | undefined,
        },
      });
    }
  }

  console.log(`Parsed layers — Roads: ${roads.length}, Parks: ${parks.length}, Water: ${water.length}, Surface: ${surface.length}`);

  return {
    roads: { type: 'FeatureCollection', features: roads } as RoadCollection,
    parks: { type: 'FeatureCollection', features: parks } as AreaCollection,
    water: { type: 'FeatureCollection', features: water } as AreaCollection,
    surface: { type: 'FeatureCollection', features: surface } as AreaCollection,
  };
}

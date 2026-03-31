import type { FeatureCollection, LineString, Polygon, MultiPolygon } from 'geojson';

export type LayerName = 'surface' | 'parks' | 'water' | 'roads';

export interface RoadProperties {
  id: number;
  name?: string;
  highway?: string;
  road_length?: number;
  [key: string]: unknown;
}

export interface AreaProperties {
  id: number;
  name?: string;
  [key: string]: unknown;
}

export type RoadCollection = FeatureCollection<LineString, RoadProperties>;
export type AreaCollection = FeatureCollection<Polygon | MultiPolygon, AreaProperties>;

export interface ManhattanLayers {
  surface: AreaCollection;
  parks: AreaCollection;
  water: AreaCollection;
  roads: RoadCollection;
}

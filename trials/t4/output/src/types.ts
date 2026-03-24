import type { Feature, Polygon, MultiPolygon, LineString, MultiLineString, Point } from 'geojson';

export interface NoiseRecord {
  latitude: number;
  longitude: number;
  complaintType: string;
  descriptor: string;
  createdDate: string;
}

export interface BuildingProperties {
  id: number;
  noiseCount: number;
  area: number;
  name?: string;
  selected?: boolean;
  highlighted?: boolean;
  [key: string]: unknown;
}

export type BuildingFeature = Feature<Polygon | MultiPolygon, BuildingProperties>;

export interface LayerFeatureProperties {
  id: number;
  layerType: string;
  name?: string;
  selected?: boolean;
  [key: string]: unknown;
}

export type SurfaceFeature = Feature<Polygon | MultiPolygon, LayerFeatureProperties>;
export type ParkFeature = Feature<Polygon | MultiPolygon, LayerFeatureProperties>;
export type WaterFeature = Feature<Polygon | MultiPolygon, LayerFeatureProperties>;
export type RoadFeature = Feature<LineString | MultiLineString, LayerFeatureProperties>;

export interface ScatterPoint {
  buildingId: number;
  noiseCount: number;
  area: number;
  x: number;
  y: number;
}

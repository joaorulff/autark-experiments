import type { Feature, Geometry } from 'geojson';

export interface NoiseRecord {
  latitude: number;
  longitude: number;
  complaintType: string;
  descriptor: string;
}

export interface BuildingProperties {
  id: number;
  noiseCount: number;
  area: number;
  selected: boolean;
  highlighted: boolean;
  [key: string]: unknown;
}

export type BuildingFeature = Feature<Geometry, BuildingProperties>;

export interface LayerData {
  surface: Feature[];
  parks: Feature[];
  water: Feature[];
  roads: Feature[];
  buildings: BuildingFeature[];
}

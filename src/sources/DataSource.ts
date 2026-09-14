import { NormalizedObservation, CategoryId } from '../types';

export interface DataSourceMeta {
  id: CategoryId;
  name: string;
  category: CategoryId;
  defaultMetric: string;
  defaultUnit: string;
  defaultThreshold: number;
  thresholdStep: number;
  thresholdMin: number;
  thresholdMax: number;
  thresholdPresets: number[];
  eventQuestion: string; // e.g. "How many high-wave events happened today?"
  eventDescription: (threshold: number, unit: string) => string;
  isAvailable: boolean;
  attributionName: string;
  attributionUrl: string;
}

export abstract class DataSource {
  abstract readonly meta: DataSourceMeta;

  abstract fetchLatest(stationId?: string): Promise<NormalizedObservation[]>;

  abstract getAvailableStations(): Promise<Array<{
    id: string;
    name: string;
    location: string;
    lat: number;
    lon: number;
    description: string;
  }>>;
}

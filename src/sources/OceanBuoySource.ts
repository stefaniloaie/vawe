import { DataSource, DataSourceMeta } from './DataSource';
import { NormalizedObservation, StationInfo, BuoyApiResponse } from '../types';

export class OceanBuoySource extends DataSource {
  readonly meta: DataSourceMeta = {
    id: 'OCEAN',
    name: 'Ocean Waves',
    category: 'OCEAN',
    defaultMetric: 'Significant wave height',
    defaultUnit: 'm',
    defaultThreshold: 3.0,
    thresholdStep: 0.25,
    thresholdMin: 1.0,
    thresholdMax: 10.0,
    thresholdPresets: [2.0, 2.5, 3.0, 3.5, 4.0, 5.0],
    eventQuestion: "How many high-wave events happened today?",
    eventDescription: (thresh, unit) => `Significant wave height above ${thresh.toFixed(2)}${unit} today`,
    isAvailable: true,
    attributionName: 'NOAA National Data Buoy Center',
    attributionUrl: 'https://www.ndbc.noaa.gov'
  };

  private stationCache: StationInfo[] | null = null;

  async getAvailableStations(): Promise<StationInfo[]> {
    if (this.stationCache) return this.stationCache;
    try {
      const res = await fetch('/api/ocean/stations');
      if (!res.ok) throw new Error('Failed to fetch stations');
      const data = await res.json();
      this.stationCache = data.stations || [];
      return this.stationCache!;
    } catch (e) {
      console.warn('Fallback to local station list:', e);
      return [
        {
          id: '46026',
          name: 'San Francisco Buoy',
          location: '18 NM West of San Francisco, CA',
          lat: 37.755,
          lon: -122.839,
          depth: '51.8 m',
          description: 'Central California shelf buoy monitoring Pacific swell heading toward the Bay Area.'
        }
      ];
    }
  }

  async fetchLatest(stationId: string = '46026'): Promise<NormalizedObservation[]> {
    const res = await fetch(`/api/ocean/buoy/${encodeURIComponent(stationId)}`);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Buoy API returned HTTP ${res.status}`);
    }
    const data: BuoyApiResponse = await res.json();
    if (!data.measurements || data.measurements.length === 0) {
      throw new Error(`No recent wave observations available for station ${stationId}`);
    }

    // Normalize into standard common format
    return data.measurements.map(m => ({
      timestamp: m.timestamp,
      latitude: data.station?.lat,
      longitude: data.station?.lon,
      metric: 'Significant wave height',
      value: m.value,
      unit: 'm',
      source: data.dataSource || 'NOAA NDBC',
      station: data.station?.id || stationId,
      dominantPeriod: m.dominantPeriod,
      averagePeriod: m.averagePeriod,
      waterTemp: m.waterTemp,
      windSpeed: m.windSpeed
    }));
  }

  async fetchFullStationData(stationId: string = '46026'): Promise<BuoyApiResponse> {
    const res = await fetch(`/api/ocean/buoy/${encodeURIComponent(stationId)}`);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Buoy API error ${res.status}`);
    }
    return res.json();
  }
}

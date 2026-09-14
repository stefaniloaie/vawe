import { DataSource, DataSourceMeta } from './DataSource';
import { NormalizedObservation, StationInfo } from '../types';

export class EarthquakeSource extends DataSource {
  readonly meta: DataSourceMeta = {
    id: 'EARTH',
    name: 'Seismic Activity',
    category: 'EARTH',
    defaultMetric: 'Earthquake magnitude',
    defaultUnit: 'M',
    defaultThreshold: 2.5,
    thresholdStep: 0.5,
    thresholdMin: 1.0,
    thresholdMax: 8.0,
    thresholdPresets: [2.5, 3.0, 4.0, 4.5, 5.0, 6.0],
    eventQuestion: "How many earthquakes happened today?",
    eventDescription: (thresh, unit) => `Magnitude ${thresh.toFixed(1)}+ earthquakes recorded today`,
    isAvailable: true,
    attributionName: 'USGS Earthquake Hazards Program',
    attributionUrl: 'https://earthquake.usgs.gov'
  };

  async getAvailableStations(): Promise<StationInfo[]> {
    return [
      {
        id: 'GLOBAL',
        name: 'Global Seismic Network',
        location: 'Worldwide Real-Time Feeds',
        lat: 0,
        lon: 0,
        description: 'Comprehensive global network of USGS seismographic sensors.'
      },
      {
        id: 'CALIFORNIA',
        name: 'California Fault Systems',
        location: 'San Andreas & Cascadia Margins',
        lat: 36.778,
        lon: -119.417,
        description: 'Dense accelerometer array monitoring coastal transform plate boundary.'
      }
    ];
  }

  async fetchLatest(stationId?: string): Promise<NormalizedObservation[]> {
    const res = await fetch('/api/earthquakes');
    if (!res.ok) throw new Error('Failed to fetch earthquake data from USGS');
    const data = await res.json();
    return (data.measurements || []).map((m: any) => ({
      timestamp: m.timestamp,
      latitude: m.coordinates?.[0],
      longitude: m.coordinates?.[1],
      metric: 'Earthquake magnitude',
      value: m.value,
      unit: 'M',
      source: 'USGS Earthquake Hazards Program',
      station: m.place || 'Global'
    }));
  }
}

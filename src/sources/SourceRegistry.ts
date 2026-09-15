import { DataSource, DataSourceMeta } from './DataSource';
import { OceanBuoySource } from './OceanBuoySource';
import { EarthquakeSource } from './EarthquakeSource';
import { CategoryId } from '../types';

export const CATEGORY_DEFINITIONS: Array<{
  id: CategoryId;
  label: string;
  question: string;
  metric: string;
  isAvailable: boolean;
  statusBadge: 'LIVE' | 'SOON' | 'SETUP';
}> = [
  {
    id: 'OCEAN',
    label: 'OCEAN',
    question: 'How many high-wave events happened today?',
    metric: 'Significant wave height',
    isAvailable: true,
    statusBadge: 'LIVE'
  },
  {
    id: 'GAME',
    label: 'GAMES',
    question: 'Which live ocean challenge would you like to play?',
    metric: 'Live ocean data games and station challenges',
    isAvailable: true,
    statusBadge: 'LIVE'
  },
  {
    id: 'EARTH',
    label: 'EARTH',
    question: 'How many earthquakes happened today?',
    metric: 'Earthquake magnitude',
    isAvailable: true,
    statusBadge: 'LIVE'
  },
  {
    id: 'AIR',
    label: 'AIR',
    question: 'How many planes crossed this area today?',
    metric: 'Flight corridor density',
    isAvailable: false,
    statusBadge: 'SETUP'
  },
  {
    id: 'SHIPS',
    label: 'SHIPS',
    question: 'How many ships entered this area today?',
    metric: 'AIS vessel transits',
    isAvailable: false,
    statusBadge: 'SETUP'
  },
  {
    id: 'WEATHER',
    label: 'WEATHER',
    question: 'How many severe wind gusts happened today?',
    metric: 'Peak wind gusts',
    isAvailable: true,
    statusBadge: 'LIVE'
  },
  {
    id: 'TRAFFIC',
    label: 'TRAFFIC',
    question: 'How many traffic surge events happened today?',
    metric: 'Corridor vehicle volume',
    isAvailable: false,
    statusBadge: 'SETUP'
  },
  {
    id: 'SPACE',
    label: 'SPACE',
    question: 'How many solar flare events happened today?',
    metric: 'X-ray solar flux',
    isAvailable: true,
    statusBadge: 'LIVE'
  }
];

export class SourceRegistry {
  private static instances: Map<CategoryId, DataSource> = new Map();

  public static getSource(category: CategoryId): DataSource {
    if (!this.instances.has(category)) {
      switch (category) {
        case 'OCEAN':
          this.instances.set(category, new OceanBuoySource());
          break;
        case 'EARTH':
          this.instances.set(category, new EarthquakeSource());
          break;
        default:
          // Fallback to Ocean buoy source
          this.instances.set(category, new OceanBuoySource());
          break;
      }
    }
    return this.instances.get(category)!;
  }
}

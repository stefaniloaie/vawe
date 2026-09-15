export type CategoryId = 'OCEAN' | 'GAME' | 'AIR' | 'SHIPS' | 'EARTH' | 'WEATHER' | 'TRAFFIC' | 'SPACE';

export type TimeRange = '1H' | '6H' | '24H' | '7D';

export interface GameBuoy {
  id: string;
  name: string;
  location: string;
  lat: number;
  lon: number;
  depth?: string;
  description: string;
  waveHeight: number;
  unit: string;
  dominantPeriod?: number | null;
  windSpeed?: number | null;
  waterTemp?: number | null;
  timestamp: string;
  sourceUrl?: string;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  streak: number;
  rankTitle: string;
  accuracy?: number;
  timestamp: string;
}

export interface StationInfo {
  id: string;
  slug?: string;
  region?: string;
  name: string;
  location: string;
  lat: number;
  lon: number;
  depth?: string;
  description: string;
  sourceName?: string;
  sourceUrl?: string;
}

// Normalized common measurement format as requested in ARCHITECTURE
export interface NormalizedObservation {
  timestamp: string; // ISO string
  latitude?: number;
  longitude?: number;
  metric: string; // e.g. "Significant Wave Height"
  value: number; // measurement value
  unit: string; // e.g. "m"
  source: string; // e.g. "NOAA NDBC"
  station: string; // station identifier or name
  // Optional extra physical properties from buoys
  dominantPeriod?: number | null; // DPD (seconds)
  averagePeriod?: number | null; // APD (seconds)
  waterTemp?: number | null; // deg C
  windSpeed?: number | null; // m/s
  raw?: any;
}

// Normalized event format produced by generic EventDetector
export interface NormalizedEvent {
  id: string;
  eventType: string; // e.g. "HIGH_WAVE" | "EARTHQUAKE_M2.5" | "GALE_GUST"
  category: CategoryId;
  timestamp: string; // Event start ISO timestamp
  endTimestamp?: string; // Event end ISO timestamp
  value: number; // Peak value reached during event
  initialValue: number; // Value at threshold crossing
  threshold: number; // Threshold at time of trigger
  durationMinutes: number; // Duration in minutes
  isOngoing: boolean;
  station: string;
  metric: string;
  unit: string;
  observationsCount: number;
}

export interface BuoyApiResponse {
  station: StationInfo;
  metric: string;
  unit: string;
  dataSource: string;
  dataSourceUrl: string;
  fetchedAt: string;
  lastObservation: string | null;
  isDelayed: boolean;
  isLive: boolean;
  totalObservations: number;
  measurements: Array<{
    timestamp: string;
    value: number;
    unit: string;
    metric: string;
    dominantPeriod?: number | null;
    averagePeriod?: number | null;
    waterTemp?: number | null;
    windSpeed?: number | null;
  }>;
  error?: string;
  isUnavailable?: boolean;
}

export interface WaveAreaRanking {
  station: StationInfo & {
    slug?: string;
    region?: string;
  };
  peakWaveHeight: number;
  unit: string;
  peakObservedAt: string;
  latestObservation: string;
  observationsInWindow: number;
  isDelayed: boolean;
  sourceUrl: string;
}

export interface WaveRankingsResponse {
  window: TimeRange;
  windowStart: string;
  fetchedAt: string;
  source: string;
  stationsReporting: number;
  rankings: WaveAreaRanking[];
}

export type NowDomain = 'EARTH' | 'OCEAN' | 'WEATHER' | 'AIR' | 'SHIPS';
export type NowEventStatus = 'LIVE' | 'RECENT';

export interface NowProviderStatus {
  domain: NowDomain;
  status: 'live' | 'unavailable' | 'forecast_only';
  source: string;
  sourceUrl?: string | null;
  retrievedAt?: string | null;
  message?: string | null;
  eventCount?: number | null;
}

export interface NowEvent {
  id: string;
  status: NowEventStatus;
  title: string;
  summary: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  location: string;
  domains: NowDomain[];
  significance: number;
  radiusKm: number;
  timeWindowMinutes: number;
  nearbyObservations: Partial<Record<NowDomain, number>>;
  sources: Array<{ name: string; url: string }>;
  correlationNote: string;
  events?: Array<{
    id: string;
    domain: NowDomain;
    title: string;
    summary: string;
    status: NowEventStatus;
    timestamp: string;
    location: string;
    source: string;
    source_url: string;
    retrieved_at: string;
    observation: NormalizedObservation;
    metadata: Record<string, unknown>;
  }>;
}

export interface NowFeedResponse {
  updatedAt: string;
  events: NowEvent[];
  providers: NowProviderStatus[];
  counts: Partial<Record<NowDomain, number | null>>;
  activeEventCount: number;
  activity: Array<{ id: string; timestamp: string; kind: 'event' | 'source'; message: string; eventId?: string; source?: string | null }>;
  isQuiet: boolean;
  correlation: { radiusKm: number; timeWindowMinutes: number; method: string };
  filters?: { domain: 'ALL' | NowDomain; status: 'ALL' | NowEventStatus; multi: boolean };
}

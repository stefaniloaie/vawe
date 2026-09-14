import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CategoryId, TimeRange, StationInfo, NormalizedObservation } from './types';
import { OceanBuoySource } from './sources/OceanBuoySource';
import { EventDetector } from './engine/EventDetector';
import { MainStatistic } from './components/MainStatistic';
import { WaveChart } from './components/WaveChart';
import { EventTimeline } from './components/EventTimeline';
import { StationSelector } from './components/StationSelector';
import { CategoryNav } from './components/CategoryNav';
import { ThresholdControl } from './components/ThresholdControl';
import { SourceTransparency } from './components/SourceTransparency';
import { LiveIndicator } from './components/LiveIndicator';
import { EarthquakeView } from './components/EarthquakeView';
import { UpcomingCategoryView } from './components/UpcomingCategoryView';
import { BuoyDuelGame } from './components/BuoyDuelGame';
import { GameTeaserBanner } from './components/GameTeaserBanner';
import { AlertTriangle, RefreshCw, Layers } from 'lucide-react';

const STORAGE_KEYS = {
  STATION: 'live_events_station_id',
  THRESHOLD: 'live_events_threshold',
  TIME_RANGE: 'live_events_time_range',
  CATEGORY: 'live_events_category',
  BEST_STREAK: 'live_events_best_streak'
};

export default function App() {
  // Navigation & Category state
  const [category, setCategory] = useState<CategoryId>(() => {
    const path = window.location.pathname;
    const search = window.location.search;
    if (search.includes('duel=true') || path.includes('/game') || path.includes('/duel')) return 'GAME';
    if (path.includes('/earthquakes')) return 'EARTH';
    if (path.includes('/aircraft')) return 'AIR';
    if (path.includes('/ships')) return 'SHIPS';
    if (path.includes('/weather')) return 'WEATHER';
    const saved = localStorage.getItem(STORAGE_KEYS.CATEGORY);
    return (saved as CategoryId) || 'OCEAN';
  });

  // Station state
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [currentStationId, setCurrentStationId] = useState<string>(() => {
    // Check URL path for station id e.g. /ocean/waves/46059
    const match = window.location.pathname.match(/\/ocean\/waves\/([A-Za-z0-9]+)/);
    if (match && match[1]) return match[1].toUpperCase();
    return localStorage.getItem(STORAGE_KEYS.STATION) || '46026';
  });

  // Threshold state (in meters)
  const [threshold, setThreshold] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.THRESHOLD);
    return saved ? parseFloat(saved) : 3.0;
  });

  // Time range state
  const [timeRange, setTimeRange] = useState<TimeRange>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.TIME_RANGE);
    return (saved as TimeRange) || '24H';
  });

  // Telemetry observations state
  const [observations, setObservations] = useState<NormalizedObservation[]>([]);
  const [stationMeta, setStationMeta] = useState<StationInfo | null>(null);
  const [dataSourceUrl, setDataSourceUrl] = useState<string>('https://www.ndbc.noaa.gov');
  const [lastObservationTime, setLastObservationTime] = useState<string | null>(null);
  const [isDelayed, setIsDelayed] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Data source instance
  const oceanSource = useMemo(() => new OceanBuoySource(), []);

  // Generic EventDetector instance
  const detector = useMemo(() => {
    return new EventDetector({
      category: 'OCEAN',
      eventType: 'HIGH_WAVE',
      threshold: threshold,
      metric: 'Significant wave height',
      unit: 'm'
    });
  }, [threshold]);

  // Load available buoy stations
  useEffect(() => {
    oceanSource.getAvailableStations().then(list => {
      setStations(list);
      const found = list.find(s => s.id === currentStationId);
      if (found) setStationMeta(found);
    }).catch(err => console.warn('Could not load station directory:', err));
  }, [oceanSource, currentStationId]);

  // Fetch telemetry from NOAA buoy
  const fetchBuoyData = useCallback(async (stationId: string, showSpinner = false) => {
    if (showSpinner) setIsLoading(true);
    setError(null);
    try {
      const response = await oceanSource.fetchFullStationData(stationId);
      if (response.error || response.isUnavailable) {
        throw new Error(response.error || `Buoy station ${stationId} is currently unavailable.`);
      }

      const normalized: NormalizedObservation[] = (response.measurements || []).map(m => ({
        timestamp: m.timestamp,
        latitude: response.station?.lat,
        longitude: response.station?.lon,
        metric: 'Significant wave height',
        value: m.value,
        unit: 'm',
        source: response.dataSource,
        station: response.station?.id || stationId,
        dominantPeriod: m.dominantPeriod,
        averagePeriod: m.averagePeriod,
        waterTemp: m.waterTemp,
        windSpeed: m.windSpeed
      }));

      setObservations(normalized);
      if (response.station) {
        setStationMeta(response.station);
      }
      setDataSourceUrl(response.dataSourceUrl || `https://www.ndbc.noaa.gov/station_page.php?station=${stationId}`);
      setLastObservationTime(response.lastObservation);
      setIsDelayed(response.isDelayed);
    } catch (err: any) {
      console.error('Buoy fetch failed:', err);
      setError(err.message || 'Unable to connect to NOAA NDBC live stream.');
    } finally {
      setIsLoading(false);
    }
  }, [oceanSource]);

  // Trigger fetch when station changes
  useEffect(() => {
    fetchBuoyData(currentStationId, true);
    localStorage.setItem(STORAGE_KEYS.STATION, currentStationId);

    // Update URL path and title for SEO
    if (category === 'OCEAN') {
      window.history.replaceState(null, '', `/ocean/waves/${currentStationId.toLowerCase()}`);
      document.title = `High Wave Events Today — Live Ocean Data (Station ${currentStationId})`;
    }
  }, [currentStationId, category, fetchBuoyData]);

  // Category changes & URL updates
  const handleSelectCategory = (newCat: CategoryId) => {
    setCategory(newCat);
    localStorage.setItem(STORAGE_KEYS.CATEGORY, newCat);
    switch (newCat) {
      case 'OCEAN':
        window.history.pushState(null, '', `/ocean/waves/${currentStationId.toLowerCase()}`);
        document.title = `High Wave Events Today — Live Ocean Data (Station ${currentStationId})`;
        break;
      case 'GAME':
        window.history.pushState(null, '', '/game');
        document.title = 'Swell Duel — Live Ocean Buoy Higher or Lower Game';
        break;
      case 'EARTH':
        window.history.pushState(null, '', '/earthquakes');
        document.title = 'Earthquake Events Today — Live Seismic Data';
        break;
      case 'AIR':
        window.history.pushState(null, '', '/aircraft');
        document.title = 'Aircraft Corridor Events Today — Live Airspace';
        break;
      case 'WEATHER':
        window.history.pushState(null, '', '/weather');
        document.title = 'Severe Gale & Wind Gust Events Today';
        break;
      default:
        window.history.pushState(null, '', `/${newCat.toLowerCase()}`);
        document.title = `${newCat} Events Today — LIVE EVENTS`;
        break;
    }
  };

  // Continuous background polling (every 45s)
  useEffect(() => {
    if (category !== 'OCEAN') return;
    const interval = setInterval(() => {
      fetchBuoyData(currentStationId, false);
    }, 45000);
    return () => clearInterval(interval);
  }, [category, currentStationId, fetchBuoyData]);

  // Persist threshold changes
  const handleThresholdChange = (newThreshold: number) => {
    setThreshold(newThreshold);
    localStorage.setItem(STORAGE_KEYS.THRESHOLD, newThreshold.toString());
  };

  // Persist time range
  const handleTimeRangeChange = (newRange: TimeRange) => {
    setTimeRange(newRange);
    localStorage.setItem(STORAGE_KEYS.TIME_RANGE, newRange);
  };

  // Process observations through the generic EventDetector
  const { allDetectedEvents, stats, highestToday, currentValue } = useMemo(() => {
    if (observations.length === 0) {
      return {
        allDetectedEvents: [],
        stats: { eventsTodayCount: 0, currentValue: null, lastEvent: null, activeEvent: null },
        highestToday: null,
        currentValue: null
      };
    }

    const detected = detector.processBatch(observations);
    const detectorStats = detector.getStats();

    // Calculate highest value in calendar day (UTC)
    const now = new Date();
    const startOfTodayMs = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
    const todayObs = observations.filter(o => new Date(o.timestamp).getTime() >= startOfTodayMs);
    const highestVal = todayObs.length > 0
      ? Math.max(...todayObs.map(o => o.value))
      : Math.max(...observations.slice(-24).map(o => o.value));

    const latest = observations[observations.length - 1];

    return {
      allDetectedEvents: detected,
      stats: detectorStats,
      highestToday: highestVal,
      currentValue: latest ? latest.value : null
    };
  }, [observations, detector]);

  return (
    <div className="min-h-screen bg-[#05070a] text-zinc-100 selection:bg-cyan-500/20 selection:text-cyan-200">
      {/* Top Ambient Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-zinc-900/80 bg-[#05070a]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo / Brand */}
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-950 border border-cyan-500/40 text-cyan-400">
                <Layers className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-base font-black tracking-wider text-white">
                  LIVE EVENTS
                </span>
                <span className="text-[10px] font-mono text-zinc-400 -mt-0.5">
                  Public Data Stream Engine
                </span>
              </div>
            </div>

            {/* Middle / Right: Station selector & Refresh */}
            <div className="flex items-center gap-3">
              {category === 'OCEAN' && (
                <StationSelector
                  stations={stations}
                  currentStationId={currentStationId}
                  onSelectStation={setCurrentStationId}
                  isLoading={isLoading}
                />
              )}

              <LiveIndicator
                isLive={!isDelayed && !error && observations.length > 0}
                isDelayed={isDelayed}
                lastUpdated={lastObservationTime}
                onRefresh={() => fetchBuoyData(currentStationId, true)}
                isLoading={isLoading}
              />
            </div>
          </div>

          {/* Category Navigation Bar */}
          <CategoryNav
            activeCategory={category}
            onSelectCategory={handleSelectCategory}
          />
        </div>
      </header>

      {/* Main Experience Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8 sm:space-y-10">
        {/* VIEW 1: OCEAN WAVES (MVP) */}
        {category === 'OCEAN' && (
          <>
            {/* Error banner if API fails */}
            {error && (
              <div id="error-banner" className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 flex items-center justify-between text-xs font-mono text-red-200">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
                  <div>
                    <span className="font-bold block">Observation Stream Interrupted</span>
                    <span>{error} (Never fabricating simulated data)</span>
                  </div>
                </div>
                <button
                  onClick={() => fetchBuoyData(currentStationId, true)}
                  className="px-3 py-1.5 rounded-lg bg-red-900/60 hover:bg-red-800 border border-red-500/50 text-white cursor-pointer"
                >
                  Retry Connection
                </button>
              </div>
            )}

            {/* DOMINANT SCREEN STATISTIC */}
            <MainStatistic
              eventCount={stats.eventsTodayCount}
              currentValue={currentValue}
              threshold={threshold}
              highestToday={highestToday}
              lastEvent={stats.lastEvent}
              activeEvent={stats.activeEvent}
              unit="m"
              metricName="Significant wave height"
              isDelayed={isDelayed}
              isLive={!isDelayed && !error && observations.length > 0}
              lastUpdated={lastObservationTime}
              onRefresh={() => fetchBuoyData(currentStationId, true)}
              isLoading={isLoading}
            />

            {/* GAME TEASER BANNER (Drives viral views & gameplay) */}
            <GameTeaserBanner
              onPlayGame={() => handleSelectCategory('GAME')}
              bestStreak={parseInt(localStorage.getItem(STORAGE_KEYS.BEST_STREAK) || '0', 10)}
            />

            {/* THRESHOLD ADJUSTER & STATION BADGE */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
              <ThresholdControl
                threshold={threshold}
                unit="m"
                presets={[2.0, 2.5, 3.0, 3.5, 4.0, 5.0]}
                step={0.25}
                min={1.0}
                max={10.0}
                onChange={handleThresholdChange}
              />

              {stationMeta && (
                <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 self-start sm:self-auto">
                  <span className="text-zinc-500">Monitoring:</span>
                  <span className="text-zinc-200 font-semibold">{stationMeta.name}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-cyan-400">NOAA #{stationMeta.id}</span>
                </div>
              )}
            </div>

            {/* DATA VISUALIZATION: WAVE CHART */}
            <WaveChart
              observations={observations}
              events={allDetectedEvents}
              threshold={threshold}
              timeRange={timeRange}
              onTimeRangeChange={handleTimeRangeChange}
              unit="m"
              metric="Significant wave height"
            />

            {/* EVENT TIMELINE */}
            <EventTimeline
              events={allDetectedEvents}
              unit="m"
              metric="Significant wave height"
              stationName={stationMeta?.name || currentStationId}
            />

            {/* SOURCE TRANSPARENCY */}
            {stationMeta && (
              <SourceTransparency
                station={stationMeta}
                dataSourceName="NOAA National Data Buoy Center"
                dataSourceUrl={dataSourceUrl}
                lastObservationTime={lastObservationTime}
                metric="Significant wave height (WVHT in meters)"
              />
            )}
          </>
        )}

        {/* VIEW: SWELL DUEL GAME */}
        {category === 'GAME' && (
          <BuoyDuelGame
            onInspectBuoy={(stationId) => {
              setCurrentStationId(stationId);
              handleSelectCategory('OCEAN');
            }}
          />
        )}

        {/* VIEW 2: EARTHQUAKES */}
        {category === 'EARTH' && (
          <EarthquakeView />
        )}

        {/* VIEW 3+: UPCOMING CATEGORIES */}
        {category !== 'OCEAN' && category !== 'EARTH' && category !== 'GAME' && (
          <UpcomingCategoryView
            category={category}
            onSelectCategory={handleSelectCategory}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-zinc-900 py-8 font-mono text-xs text-zinc-500 text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="font-bold text-zinc-200">LIVE EVENTS</span>
            <span>—</span>
            <span>Live data stream event detection & real-time statistics</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://www.ndbc.noaa.gov"
              target="_blank"
              rel="noreferrer"
              className="hover:text-cyan-400 transition-colors"
            >
              NOAA NDBC Feed
            </a>
            <a
              href="https://earthquake.usgs.gov"
              target="_blank"
              rel="noreferrer"
              className="hover:text-cyan-400 transition-colors"
            >
              USGS Feeds
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

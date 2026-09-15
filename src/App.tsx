import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { CategoryId, TimeRange, StationInfo, NormalizedObservation } from './types';
import { OceanBuoySource } from './sources/OceanBuoySource';
import { EventDetector } from './engine/EventDetector';
import { MainStatistic } from './components/MainStatistic';
import { WaveChart } from './components/WaveChart';
import { EventTimeline } from './components/EventTimeline';
import { WaveAreaRankings } from './components/WaveAreaRankings';
import { StationSelector } from './components/StationSelector';
import { CategoryNav } from './components/CategoryNav';
import { ThresholdControl } from './components/ThresholdControl';
import { SourceTransparency } from './components/SourceTransparency';
import { LiveIndicator } from './components/LiveIndicator';
import { UpcomingCategoryView } from './components/UpcomingCategoryView';
import { GameTeaserBanner } from './components/GameTeaserBanner';
import { NowView } from './components/NowView';
import { EventDetailView } from './components/EventDetailView';
import { AlertTriangle, Layers, Waves } from 'lucide-react';

const GamesHub = lazy(() => import('./components/GamesHub').then(module => ({ default: module.GamesHub })));
const EarthquakeView = lazy(() => import('./components/EarthquakeView').then(module => ({ default: module.EarthquakeView })));
const DailySwellDuel = lazy(() => import('./components/DailySwellDuel').then(module => ({ default: module.DailySwellDuel })));

const RouteLoading = () => (
  <div className="flex min-h-64 items-center justify-center font-mono text-sm text-cyan-100/70">
    Loading this live-data view…
  </div>
);

const STORAGE_KEYS = {
  STATION: 'live_events_station_id',
  THRESHOLD: 'live_events_threshold',
  TIME_RANGE: 'live_events_time_range',
  CATEGORY: 'live_events_category',
  BEST_STREAK: 'live_events_best_streak'
};

export default function App() {
  const isDailyGameRoute = /^\/game\/daily\/\d{4}-\d{2}-\d{2}$/.test(window.location.pathname);
  const initialEventId = window.location.pathname.match(/^\/events\/([^/]+)$/)?.[1] || null;
  const [routeMode, setRouteMode] = useState<'NOW' | 'EVENT' | null>(() => window.location.pathname === '/now' ? 'NOW' : initialEventId ? 'EVENT' : null);
  const [currentEventId, setCurrentEventId] = useState<string | null>(initialEventId);
  useEffect(() => {
    if (isDailyGameRoute) {
      const date = window.location.pathname.split('/').pop();
      document.title = `Swell Duel Daily Challenge — ${date} | Signal Atlas`;
    }
  }, [isDailyGameRoute]);
  useEffect(() => {
    if (routeMode === 'NOW') document.title = "What's Happening Right Now? Live World Events | Signal Atlas";
    if (routeMode === 'EVENT') document.title = 'Live Event Detail | Signal Atlas';
  }, [routeMode]);
  // Navigation & Category state
  const [category, setCategory] = useState<CategoryId>(() => {
    const path = window.location.pathname;
    const search = window.location.search;
    if (search.includes('duel=true') || path.includes('/game') || path.includes('/duel')) return 'GAME';
    if (path.includes('/earthquakes')) return 'EARTH';
    if (path.includes('/aircraft')) return 'AIR';
    if (path.includes('/ships')) return 'SHIPS';
    if (path.includes('/weather')) return 'WEATHER';
    if (path === '/waves' || path.startsWith('/waves/') || path.startsWith('/ocean/waves/') || path.startsWith('/buoys/')) return 'OCEAN';
    const saved = localStorage.getItem(STORAGE_KEYS.CATEGORY);
    return (saved as CategoryId) || 'OCEAN';
  });

  // Station state
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [currentStationId, setCurrentStationId] = useState<string>(() => {
    // Accept the legacy dashboard path and canonical buoy slugs.
    const match = window.location.pathname.match(/\/(?:ocean\/waves|buoys)\/([A-Za-z0-9]+)/);
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

  const canonicalStationPath = useMemo(() => {
    const station = stations.find(item => item.id === currentStationId);
    return station?.slug ? `/buoys/${station.slug}` : '/waves';
  }, [stations, currentStationId]);

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
    if (routeMode) return;
    fetchBuoyData(currentStationId, true);
    localStorage.setItem(STORAGE_KEYS.STATION, currentStationId);

    // Keep client navigation on the same public URL that Django renders and canonicalizes.
    if (category === 'OCEAN') {
      window.history.replaceState(null, '', canonicalStationPath);
      document.title = `Live Wave Height Today — NOAA Buoy ${currentStationId} | Signal Atlas`;
    }
  }, [currentStationId, category, canonicalStationPath, fetchBuoyData, routeMode]);

  // Category changes & URL updates
  const handleSelectCategory = (newCat: CategoryId) => {
    setRouteMode(null);
    setCurrentEventId(null);
    setCategory(newCat);
    localStorage.setItem(STORAGE_KEYS.CATEGORY, newCat);
    switch (newCat) {
      case 'OCEAN':
        window.history.pushState(null, '', canonicalStationPath);
        document.title = `Live Wave Height Today — NOAA Buoy ${currentStationId} | Signal Atlas`;
        break;
      case 'GAME':
        window.history.pushState(null, '', '/game');
        document.title = 'Signal Atlas Ocean Games — Live NOAA Buoy Challenges';
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

  const handleSelectNow = () => {
    setRouteMode('NOW');
    setCurrentEventId(null);
    window.history.pushState(null, '', '/now');
    document.title = "What's Happening Right Now? Live World Events | Signal Atlas";
  };

  const handleOpenEvent = (eventId: string) => {
    setRouteMode('EVENT');
    setCurrentEventId(eventId);
    window.history.pushState(null, '', `/events/${eventId}`);
    document.title = 'Live Event Detail | Signal Atlas';
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
    <div className={`cinematic-app min-h-screen overflow-hidden bg-[#061827] text-slate-100 selection:bg-cyan-300/30 selection:text-white ${category === 'OCEAN' ? 'ocean-page' : ''} ${category === 'WEATHER' ? 'weather-page' : ''} ${category === 'SPACE' ? 'space-page' : ''}`}>
      <div className="cinematic-page-glow pointer-events-none fixed inset-x-0 top-0 -z-0 h-[48rem] opacity-80" />
      {/* Top Ambient Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-cyan-100/10 bg-[#061827]/80 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-[4.5rem] items-center justify-between">
            {/* Logo / Brand */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-100/35 bg-cyan-100/10 text-cyan-100 shadow-[0_0_28px_rgba(103,232,249,0.22)]">
                <Layers className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-base font-black tracking-[0.16em] text-white">
                  SIGNAL ATLAS
                </span>
                <span className="-mt-0.5 text-[10px] font-mono text-cyan-100/55">
                  Live data observatory
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

              {!routeMode && <LiveIndicator
                isLive={!isDelayed && !error && observations.length > 0}
                isDelayed={isDelayed}
                lastUpdated={lastObservationTime}
                onRefresh={() => fetchBuoyData(currentStationId, true)}
                isLoading={isLoading}
              />}
            </div>
          </div>

          {/* Category Navigation Bar */}
          <CategoryNav
            activeCategory={category}
            onSelectCategory={handleSelectCategory}
            isNowActive={routeMode === 'NOW'}
            isSpecialRoute={Boolean(routeMode)}
            onSelectNow={handleSelectNow}
          />
        </div>
      </header>

      {/* Main Experience Container */}
      <main className="relative z-10 mx-auto max-w-7xl space-y-8 px-4 py-6 sm:space-y-10 sm:px-6 sm:py-8 lg:px-8">
        {routeMode === 'NOW' && <NowView onOpenEvent={handleOpenEvent} />}

        {routeMode === 'EVENT' && currentEventId && <EventDetailView eventId={currentEventId} onBackToNow={handleSelectNow} />}

        {/* VIEW 1: OCEAN WAVES (MVP) */}
        {!routeMode && category === 'OCEAN' && (
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
              stationName={stationMeta?.name}
              stationId={stationMeta?.id || currentStationId}
            />

            <WaveAreaRankings
              timeRange={timeRange}
              refreshKey={lastObservationTime}
              onSelectStation={setCurrentStationId}
            />

            {/* GAME TEASER BANNER (Drives viral views & gameplay) */}
            <GameTeaserBanner
              onPlayGame={() => handleSelectCategory('GAME')}
              bestStreak={parseInt(localStorage.getItem(STORAGE_KEYS.BEST_STREAK) || '0', 10)}
            />

            {/* THRESHOLD ADJUSTER & STATION BADGE */}
            <div className="ocean-control-surface flex flex-col justify-between gap-4 rounded-2xl border border-cyan-100/10 bg-[#0b2a40]/70 p-4 shadow-[0_16px_40px_rgba(3,22,37,0.18)] backdrop-blur-xl sm:flex-row sm:items-center sm:p-5">
              <div className="flex items-center gap-3">
                <div className="hidden h-9 w-9 items-center justify-center rounded-full border border-cyan-100/20 bg-cyan-100/10 text-cyan-100 sm:flex"><Waves className="h-4 w-4" /></div>
                <ThresholdControl
                  threshold={threshold}
                  unit="m"
                  presets={[2.0, 2.5, 3.0, 3.5, 4.0, 5.0]}
                  step={0.25}
                  min={1.0}
                  max={10.0}
                  onChange={handleThresholdChange}
                />
              </div>

              {stationMeta && (
                <div className="flex items-center gap-2 self-start text-xs font-mono text-cyan-50/65 sm:self-auto">
                  <span className="text-cyan-50/45">Tracking</span>
                  <span className="font-semibold text-white">{stationMeta.name}</span>
                  <span className="text-cyan-100/35">·</span>
                  <span className="text-cyan-200">NOAA #{stationMeta.id}</span>
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
        {!routeMode && category === 'GAME' && (
          <Suspense fallback={<RouteLoading />}>
            {isDailyGameRoute ? <DailySwellDuel /> : <GamesHub
              onInspectBuoy={(stationId) => {
                setCurrentStationId(stationId);
                handleSelectCategory('OCEAN');
              }}
            />}
          </Suspense>
        )}

        {/* VIEW 2: EARTHQUAKES */}
        {!routeMode && category === 'EARTH' && (
          <Suspense fallback={<RouteLoading />}><EarthquakeView /></Suspense>
        )}

        {/* VIEW 3+: UPCOMING CATEGORIES */}
        {!routeMode && category !== 'OCEAN' && category !== 'EARTH' && category !== 'GAME' && (
          <UpcomingCategoryView
            category={category}
            onSelectCategory={handleSelectCategory}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-16 border-t border-cyan-100/10 py-8 text-center font-mono text-xs text-cyan-50/45">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-cyan-50/55">
            <span className="font-bold text-cyan-50">Signal Atlas</span>
            <span>—</span>
            <span>Public signals, clear context & real-time statistics</span>
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

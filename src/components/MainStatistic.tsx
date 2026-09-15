import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { NormalizedEvent } from '../types';

interface MainStatisticProps {
  eventCount: number;
  currentValue: number | null;
  threshold: number;
  highestToday: number | null;
  lastEvent: NormalizedEvent | null;
  activeEvent: NormalizedEvent | null;
  unit: string;
  metricName: string;
  isDelayed: boolean;
  isLive: boolean;
  lastUpdated: string | null;
  onRefresh?: () => void;
  isLoading?: boolean;
  stationName?: string;
  stationId?: string;
}

export const MainStatistic: React.FC<MainStatisticProps> = ({
  eventCount,
  currentValue,
  threshold,
  highestToday,
  lastEvent,
  activeEvent,
  unit,
  metricName,
  isDelayed,
  isLive,
  lastUpdated,
  onRefresh,
  isLoading,
  stationName,
  stationId
}) => {
  const prevCountRef = useRef(eventCount);
  const [hasNewEventPulse, setHasNewEventPulse] = useState(false);

  useEffect(() => {
    if (eventCount > prevCountRef.current) {
      setHasNewEventPulse(true);
      const timer = setTimeout(() => setHasNewEventPulse(false), 2400);
      return () => clearTimeout(timer);
    }
    prevCountRef.current = eventCount;
  }, [eventCount]);

  // Format last event text: e.g. "3.71 m · 12 min ago"
  const formatLastEvent = () => {
    if (activeEvent) {
      return `${activeEvent.value.toFixed(2)} ${unit} · Ongoing now`;
    }
    if (!lastEvent) {
      return 'None today';
    }
    const eventTime = new Date(lastEvent.timestamp).getTime();
    const now = Date.now();
    const diffMin = Math.max(1, Math.round((now - eventTime) / 60000));
    if (diffMin < 60) {
      return `${lastEvent.value.toFixed(2)} ${unit} · ${diffMin} min ago`;
    }
    const diffHours = Math.floor(diffMin / 60);
    const remMin = diffMin % 60;
    return `${lastEvent.value.toFixed(2)} ${unit} · ${diffHours}h ${remMin > 0 ? `${remMin}m ` : ''}ago`;
  };

  const isCurrentlyExceeded = currentValue !== null && currentValue >= threshold;

  const formatObservationTimestamp = () => {
    if (!lastUpdated) return 'Awaiting source record';
    return new Date(lastUpdated).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  return (
    <section id="main-statistic-container" className="cinematic-hero relative isolate w-full overflow-hidden rounded-[2rem] border border-cyan-100/25 px-5 py-7 text-center shadow-[0_32px_100px_rgba(4,26,44,0.35)] sm:px-9 sm:py-10 sm:text-left">
      <div className="absolute inset-0 -z-20 overflow-hidden bg-[#0b78ad]">
        <img
          src="/images/ocean-cinematic-hero.png"
          alt="Sunlit ocean swells near a distant coastline"
          className="cinematic-hero-image h-full w-full object-cover"
        />
      </div>
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(3,25,43,0.8)_0%,rgba(5,43,67,0.6)_38%,rgba(5,55,79,0.2)_72%,rgba(5,55,79,0.04)_100%)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_75%_10%,rgba(220,250,255,0.42),transparent_26%),linear-gradient(to_top,rgba(2,21,37,0.56),transparent_56%)]" />
      <div className="ocean-wave-motion pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[56%] overflow-hidden" aria-hidden="true">
        <svg className="ocean-wave-svg ocean-wave-svg-one" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path d="M0 176C154 103 293 250 476 170C655 92 809 239 977 159C1149 77 1293 209 1440 137V320H0Z" />
        </svg>
        <svg className="ocean-wave-svg ocean-wave-svg-two" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path d="M0 190C180 126 326 234 505 173C670 116 832 245 1000 176C1158 110 1314 202 1440 150V320H0Z" />
        </svg>
        <svg className="ocean-wave-svg ocean-wave-svg-three" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path d="M0 214C161 163 316 243 486 204C663 162 813 243 989 197C1165 152 1305 226 1440 178V320H0Z" />
        </svg>
      </div>
      <div className="cinematic-grid pointer-events-none absolute inset-0 -z-10 opacity-40" />

      <div className="relative z-10">
      {/* Background ambient radial glow for cinematic mood */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-64 w-full max-w-3xl opacity-40 blur-3xl transition-all duration-700"
        style={{
          background: activeEvent
            ? 'radial-gradient(circle, rgba(245, 158, 11, 0.4) 0%, rgba(245, 158, 11, 0) 70%)'
            : 'radial-gradient(circle, rgba(6, 182, 212, 0.25) 0%, rgba(6, 182, 212, 0) 70%)'
        }}
      />

      {/* Top Section / Question */}
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center justify-center gap-2.5 sm:justify-start">
          <span className="rounded-full border border-cyan-100/40 bg-cyan-100/15 px-2.5 py-1 text-[10px] font-mono font-bold tracking-[0.2em] text-cyan-50 uppercase backdrop-blur-md">
            Ocean observatory
          </span>
          <span className="hidden text-xs font-mono text-cyan-50/70 sm:inline">
            Live telemetry layer
          </span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-xl border border-cyan-50/20 bg-[#06324a]/40 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-50/90 shadow-[0_8px_24px_rgba(1,21,37,0.18)] backdrop-blur-md sm:items-end">
          <span>{stationName || 'Pacific buoy network'}{stationId ? ` · NOAA ${stationId}` : ''}</span>
          <span className="inline-flex items-center gap-1.5 text-[9px] text-cyan-50/60"><i className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,1)]' : 'bg-amber-300'}`} /> {isLive ? 'Signal verified' : 'Stream awaiting update'}</span>
          <span className="normal-case tracking-normal text-[10px] text-cyan-50/90">Last buoy record · {formatObservationTimestamp()}</span>
        </div>
      </div>

      {/* Dominant Primary Headline Metric */}
      <div className="relative mt-10 flex flex-col items-center sm:mt-14 sm:items-start">
        <div className="flex items-baseline gap-4 sm:gap-6">
          <div className="relative">
            <AnimatePresence mode="popLayout">
              <motion.div
                key={eventCount}
                initial={{ y: 20, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -20, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className={`font-mono text-8xl sm:text-9xl md:text-[11rem] font-black tracking-tighter leading-none select-none ${
                  activeEvent
                    ? 'text-amber-200 drop-shadow-[0_0_35px_rgba(253,230,138,0.65)]'
                    : hasNewEventPulse
                    ? 'text-cyan-100 drop-shadow-[0_0_40px_rgba(165,243,252,0.8)]'
                    : 'text-white drop-shadow-[0_8px_28px_rgba(0,27,45,0.45)]'
                }`}
              >
                {eventCount}
              </motion.div>
            </AnimatePresence>

            {hasNewEventPulse && (
              <motion.span
                initial={{ scale: 0.8, opacity: 1 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{ duration: 1.2 }}
                className="pointer-events-none absolute inset-0 rounded-full border-2 border-cyan-400/60"
              />
            )}
          </div>

          <div className="flex flex-col text-left">
            <span className="text-2xl font-black uppercase tracking-tight text-white drop-shadow-sm sm:text-4xl md:text-5xl font-sans leading-none">
              High-wave events
            </span>
            <span className="mt-2 text-sm font-mono text-cyan-50/80 sm:text-lg font-normal">
              Significant wave height above {threshold.toFixed(2)}{unit} today
            </span>
            {activeEvent && (
              <span className="mt-2 inline-flex items-center gap-2 self-start px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold animate-pulse">
                <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                ACTIVE EVENT IN PROGRESS ({activeEvent.value.toFixed(2)}{unit})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Horizontal Mission-Control Telemetry Metrics Grid */}
      <div
        id="telemetry-grid"
        className="relative mt-9 grid grid-cols-2 gap-3 rounded-2xl border border-white/20 bg-[#06233a]/65 p-3 font-mono shadow-2xl backdrop-blur-xl sm:mt-12 sm:grid-cols-3 sm:gap-4 sm:p-5 lg:grid-cols-6"
      >
        {/* 1. CURRENT */}
        <div id="stat-current" className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur-sm">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-100/65">
            CURRENT
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl sm:text-3xl font-bold tracking-tight ${
              isCurrentlyExceeded ? 'text-amber-100' : 'text-white'
            }`}>
              {currentValue !== null ? currentValue.toFixed(2) : '--'}
            </span>
            <span className="text-xs font-medium text-cyan-50/70">{unit}</span>
          </div>
          <div className="mt-1 text-[10px] text-cyan-50/60">
            {isCurrentlyExceeded ? 'Above threshold' : 'Nominal state'}
          </div>
        </div>

        {/* 2. THRESHOLD */}
        <div id="stat-threshold" className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur-sm">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-100/65">
            THRESHOLD
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-100">
              {threshold.toFixed(2)}
            </span>
            <span className="text-xs font-medium text-cyan-50/70">{unit}</span>
          </div>
          <div className="mt-1 text-[10px] text-cyan-50/60">
            Configured trigger
          </div>
        </div>

        {/* 3. EVENTS TODAY */}
        <div id="stat-events-today" className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur-sm">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-100/65">
            EVENTS TODAY
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight text-cyan-50">
              {eventCount}
            </span>
            <span className="text-xs font-medium text-cyan-50/70">triggers</span>
          </div>
          <div className="mt-1 text-[10px] text-cyan-50/60">
            Calendar day total
          </div>
        </div>

        {/* 4. HIGHEST TODAY */}
        <div id="stat-highest-today" className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur-sm">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-100/65">
            HIGHEST TODAY
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {highestToday !== null ? highestToday.toFixed(2) : '--'}
            </span>
            <span className="text-xs font-medium text-cyan-50/70">{unit}</span>
          </div>
          <div className="mt-1 text-[10px] text-cyan-50/60">
            Peak wave recorded
          </div>
        </div>

        {/* 5. LAST EVENT */}
        <div id="stat-last-event" className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur-sm sm:col-span-2 lg:col-span-1">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-100/65">
            LAST EVENT
          </div>
          <div className="truncate text-sm font-bold text-white sm:text-base">
            {formatLastEvent()}
          </div>
          <div className="mt-1 text-[10px] text-cyan-50/60">
            {activeEvent ? 'Exceeding now' : 'Previous crossing'}
          </div>
        </div>

        {/* 6. LIVE STATUS */}
        <div id="stat-live-status" className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur-sm sm:col-span-2 lg:col-span-1">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-100/65">
            LIVE STATUS
          </div>
          <div className="flex items-center gap-2">
            {isDelayed ? (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
                <span className="text-sm font-bold text-amber-100">DELAYED</span>
              </>
            ) : (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-sm font-bold text-emerald-100">● LIVE</span>
              </>
            )}
          </div>
          <div className="mt-1 text-[10px] text-cyan-50/60">
            {lastUpdated ? `Recorded ${formatObservationTimestamp()}` : 'Syncing...'}
          </div>
        </div>
      </div>
      </div>
    </section>
  );
};

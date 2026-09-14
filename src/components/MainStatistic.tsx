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
  isLoading
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

  return (
    <div id="main-statistic-container" className="relative w-full text-center sm:text-left py-6 sm:py-10">
      {/* Background ambient radial glow for cinematic mood */}
      <div
        className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-full max-w-3xl h-64 opacity-25 blur-3xl transition-all duration-700"
        style={{
          background: activeEvent
            ? 'radial-gradient(circle, rgba(245, 158, 11, 0.4) 0%, rgba(245, 158, 11, 0) 70%)'
            : 'radial-gradient(circle, rgba(6, 182, 212, 0.25) 0%, rgba(6, 182, 212, 0) 70%)'
        }}
      />

      {/* Top Section / Question */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-2">
        <div className="flex items-center justify-center sm:justify-start gap-2.5">
          <span className="text-xs font-mono font-bold tracking-[0.2em] text-cyan-400 uppercase">
            LIVE EVENTS
          </span>
          <span className="text-zinc-700">/</span>
          <span className="text-xs font-mono text-zinc-400">
            Real-Time Phenomenon Detection
          </span>
        </div>

        <div className="text-xs font-mono text-zinc-400 italic text-center sm:text-right">
          &ldquo;What&apos;s happening right now?&rdquo;
        </div>
      </div>

      {/* Dominant Primary Headline Metric */}
      <div className="mt-4 sm:mt-6 flex flex-col items-center sm:items-start">
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
                    ? 'text-amber-400 drop-shadow-[0_0_35px_rgba(245,158,11,0.4)]'
                    : hasNewEventPulse
                    ? 'text-cyan-300 drop-shadow-[0_0_40px_rgba(34,211,238,0.5)]'
                    : 'text-white'
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
            <span className="text-2xl sm:text-4xl md:text-5xl font-black uppercase tracking-tight text-zinc-100 font-sans leading-none">
              HIGH-WAVE EVENTS
            </span>
            <span className="mt-2 text-sm sm:text-lg font-mono text-zinc-400 font-normal">
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
        className="mt-8 sm:mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 p-4 sm:p-5 rounded-2xl bg-zinc-950/90 border border-zinc-800/80 backdrop-blur-xl shadow-2xl font-mono"
      >
        {/* 1. CURRENT */}
        <div id="stat-current" className="flex flex-col justify-between p-3 rounded-xl bg-zinc-900/40 border border-zinc-850">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
            CURRENT
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl sm:text-3xl font-bold tracking-tight ${
              isCurrentlyExceeded ? 'text-amber-400' : 'text-white'
            }`}>
              {currentValue !== null ? currentValue.toFixed(2) : '--'}
            </span>
            <span className="text-xs text-zinc-400 font-medium">{unit}</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">
            {isCurrentlyExceeded ? 'Above threshold' : 'Nominal state'}
          </div>
        </div>

        {/* 2. THRESHOLD */}
        <div id="stat-threshold" className="flex flex-col justify-between p-3 rounded-xl bg-zinc-900/40 border border-zinc-850">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
            THRESHOLD
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-300">
              {threshold.toFixed(2)}
            </span>
            <span className="text-xs text-zinc-400 font-medium">{unit}</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">
            Configured trigger
          </div>
        </div>

        {/* 3. EVENTS TODAY */}
        <div id="stat-events-today" className="flex flex-col justify-between p-3 rounded-xl bg-zinc-900/40 border border-zinc-850">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
            EVENTS TODAY
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight text-cyan-300">
              {eventCount}
            </span>
            <span className="text-xs text-zinc-400 font-medium">triggers</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">
            Calendar day total
          </div>
        </div>

        {/* 4. HIGHEST TODAY */}
        <div id="stat-highest-today" className="flex flex-col justify-between p-3 rounded-xl bg-zinc-900/40 border border-zinc-850">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
            HIGHEST TODAY
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {highestToday !== null ? highestToday.toFixed(2) : '--'}
            </span>
            <span className="text-xs text-zinc-400 font-medium">{unit}</span>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">
            Peak wave recorded
          </div>
        </div>

        {/* 5. LAST EVENT */}
        <div id="stat-last-event" className="flex flex-col justify-between p-3 rounded-xl bg-zinc-900/40 border border-zinc-850 sm:col-span-2 lg:col-span-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
            LAST EVENT
          </div>
          <div className="text-sm sm:text-base font-bold text-zinc-200 truncate">
            {formatLastEvent()}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">
            {activeEvent ? 'Exceeding now' : 'Previous crossing'}
          </div>
        </div>

        {/* 6. LIVE STATUS */}
        <div id="stat-live-status" className="flex flex-col justify-between p-3 rounded-xl bg-zinc-900/40 border border-zinc-850 sm:col-span-2 lg:col-span-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
            LIVE STATUS
          </div>
          <div className="flex items-center gap-2">
            {isDelayed ? (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
                <span className="text-sm font-bold text-amber-400">DELAYED</span>
              </>
            ) : (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-sm font-bold text-emerald-400">● LIVE</span>
              </>
            )}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 truncate">
            {lastUpdated ? `${new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Syncing...'}
          </div>
        </div>
      </div>
    </div>
  );
};

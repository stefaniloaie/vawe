import React, { useState, useEffect, useMemo } from 'react';
import { EarthquakeSource } from '../sources/EarthquakeSource';
import { EventDetector } from '../engine/EventDetector';
import { NormalizedObservation, NormalizedEvent } from '../types';
import { LiveIndicator } from './LiveIndicator';
import { ThresholdControl } from './ThresholdControl';
import { Activity, AlertTriangle, Clock, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const EarthquakeView: React.FC = () => {
  const [source] = useState(() => new EarthquakeSource());
  const [threshold, setThreshold] = useState<number>(2.5);
  const [observations, setObservations] = useState<NormalizedObservation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const detector = useMemo(() => {
    return new EventDetector({
      category: 'EARTH',
      eventType: 'EARTHQUAKE_M',
      threshold: threshold,
      metric: 'Earthquake magnitude',
      unit: 'M'
    });
  }, [threshold]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await source.fetchLatest();
      setObservations(data);
      setLastUpdated(new Date().toISOString());
    } catch (e: any) {
      setError(e.message || 'Failed to fetch seismic telemetry');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Detect events using generic EventDetector
  const { events, stats, highestMag } = useMemo(() => {
    if (observations.length === 0) {
      return { events: [], stats: { eventsTodayCount: 0, currentValue: null }, highestMag: 0 };
    }
    const detected = detector.processBatch(observations);
    const s = detector.getStats();
    const maxVal = Math.max(...observations.map(o => o.value), 0);
    return { events: detected, stats: s, highestMag: maxVal };
  }, [observations, detector]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-900">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-red-950/50 border border-red-500/30 text-red-400">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-wider text-zinc-200 uppercase font-mono">
              USGS Global Seismic Stream
            </h2>
            <p className="text-xs text-zinc-500 font-mono">
              Live earthquake magnitude event detection
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThresholdControl
            threshold={threshold}
            unit="M"
            presets={[2.5, 3.0, 4.0, 4.5, 5.0]}
            step={0.5}
            min={1.0}
            max={8.0}
            onChange={setThreshold}
          />
          <LiveIndicator
            isLive={!error && observations.length > 0}
            isDelayed={false}
            lastUpdated={lastUpdated}
            onRefresh={loadData}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Main Headline Counter */}
      <div className="py-6 text-left">
        <div className="flex items-baseline gap-6">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={stats.eventsTodayCount}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="font-mono text-8xl sm:text-9xl font-black text-amber-400 tracking-tighter"
            >
              {stats.eventsTodayCount}
            </motion.div>
          </AnimatePresence>
          <div>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white font-sans uppercase">
              SEISMIC EVENTS TODAY
            </h1>
            <p className="text-sm sm:text-lg text-zinc-400 font-mono mt-2">
              Earthquakes exceeding M{threshold.toFixed(1)} recorded in past 24 hours
            </p>
          </div>
        </div>
      </div>

      {/* Stats Band */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-xs">
        <div className="p-3 rounded-lg bg-zinc-900/40">
          <span className="text-zinc-500 uppercase text-[10px] block mb-1">THRESHOLD</span>
          <span className="text-xl font-bold text-amber-300">M {threshold.toFixed(1)}</span>
        </div>
        <div className="p-3 rounded-lg bg-zinc-900/40">
          <span className="text-zinc-500 uppercase text-[10px] block mb-1">PEAK MAGNITUDE</span>
          <span className="text-xl font-bold text-red-400">M {highestMag.toFixed(1)}</span>
        </div>
        <div className="p-3 rounded-lg bg-zinc-900/40">
          <span className="text-zinc-500 uppercase text-[10px] block mb-1">EVENTS DETECTED</span>
          <span className="text-xl font-bold text-cyan-300">{stats.eventsTodayCount}</span>
        </div>
        <div className="p-3 rounded-lg bg-zinc-900/40">
          <span className="text-zinc-500 uppercase text-[10px] block mb-1">TOTAL GLOBAL QUAKES</span>
          <span className="text-xl font-bold text-white">{observations.length}</span>
        </div>
      </div>

      {/* Events Log */}
      <div className="rounded-2xl bg-zinc-950/80 border border-zinc-800/80 p-5 font-mono">
        <h3 className="text-xs uppercase tracking-wider text-zinc-400 font-bold mb-4 flex items-center justify-between">
          <span>Recent Exceedance Events (M &gt;= {threshold.toFixed(1)})</span>
          <a
            href="https://earthquake.usgs.gov"
            target="_blank"
            rel="noreferrer"
            className="text-cyan-400 hover:text-cyan-300 text-[11px] inline-flex items-center gap-1 font-normal"
          >
            USGS Hazards <ExternalLink className="h-3 w-3" />
          </a>
        </h3>

        {events.length === 0 ? (
          <div className="py-8 text-center text-zinc-500 text-xs">
            No events above M{threshold.toFixed(1)} detected in the current 24-hour window.
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {[...events].reverse().map((evt, i) => (
              <div
                key={evt.id || i}
                className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/40 border border-zinc-850 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold text-white">
                    {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-zinc-600">—</span>
                  <span className="font-bold text-red-400">
                    M {evt.value.toFixed(1)}
                  </span>
                  <span className="text-zinc-600">—</span>
                  <span className="text-zinc-300 truncate max-w-xs sm:max-w-md">
                    {evt.station}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase">
                  DETECTED
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

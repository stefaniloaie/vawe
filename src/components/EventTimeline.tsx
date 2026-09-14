import React from 'react';
import { NormalizedEvent } from '../types';

interface EventTimelineProps {
  events: NormalizedEvent[];
  unit: string;
  metric: string;
  stationName: string;
}

export const EventTimeline: React.FC<EventTimelineProps> = ({
  events,
  unit,
  stationName
}) => {
  // Sort most recent first
  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const formatEventTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatEventDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatDuration = (minutes: number, isOngoing: boolean) => {
    if (isOngoing) {
      if (minutes < 1) return 'Ongoing (Just started)';
      return `Ongoing (${minutes}m elapsed)`;
    }
    if (minutes < 1) return '< 10 min';
    if (minutes < 60) return `${minutes} min duration`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m duration` : `${h}h duration`;
  };

  return (
    <div id="event-timeline-container" className="rounded-2xl bg-zinc-950/80 border border-zinc-800/80 p-5 sm:p-6 backdrop-blur-md">
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-zinc-850">
        <div className="flex items-center gap-2.5">
          <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse"></div>
          <h3 className="text-sm font-semibold tracking-wider uppercase text-zinc-200">
            Detected Event Log
          </h3>
        </div>
        <span className="text-xs font-mono text-zinc-500">
          {events.length} {events.length === 1 ? 'event' : 'events'} recorded
        </span>
      </div>

      {sortedEvents.length === 0 ? (
        <div className="py-10 text-center text-zinc-500 font-mono text-sm">
          <div className="text-zinc-400 font-medium mb-1">No high-wave events detected in this period</div>
          <p className="text-xs text-zinc-600 max-w-md mx-auto">
            Significant wave height stayed below the threshold throughout the historical observation window.
          </p>
        </div>
      ) : (
        <div className="space-y-3 font-mono">
          {sortedEvents.map((evt, idx) => {
            const isLatest = idx === 0;
            return (
              <div
                key={evt.id}
                id={`event-item-${idx}`}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-xl border transition-all ${
                  evt.isOngoing
                    ? 'bg-amber-950/20 border-amber-500/40 shadow-sm shadow-amber-950/30'
                    : isLatest
                    ? 'bg-zinc-900/60 border-zinc-700/60'
                    : 'bg-zinc-900/30 border-zinc-800/50 hover:border-zinc-700/60'
                }`}
              >
                {/* Left: Time and measured peak value */}
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white tracking-wider">
                      {formatEventTime(evt.timestamp)}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {formatEventDate(evt.timestamp)}
                    </span>
                  </div>

                  <span className="text-zinc-600 font-sans">—</span>

                  <div className="flex items-baseline gap-1">
                    <span className="text-base font-bold text-amber-300">
                      {evt.value.toFixed(2)} {unit}
                    </span>
                    <span className="text-[11px] text-zinc-400">peak</span>
                  </div>

                  <span className="text-zinc-600 font-sans">—</span>

                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-bold tracking-wider uppercase border border-amber-500/30">
                      HIGH WAVE
                    </span>
                    {evt.isOngoing && (
                      <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 text-[10px] font-bold tracking-wider uppercase border border-red-500/30 animate-pulse">
                        ACTIVE
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Event Duration & Details */}
                <div className="flex items-center gap-3 text-xs text-zinc-400 self-end sm:self-auto">
                  <span className="text-zinc-300 font-medium">
                    {formatDuration(evt.durationMinutes, evt.isOngoing)}
                  </span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-500 text-[11px]">
                    crossed &gt; {evt.threshold.toFixed(2)}{unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

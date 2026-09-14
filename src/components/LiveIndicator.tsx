import React, { useEffect, useState } from 'react';

interface LiveIndicatorProps {
  isLive: boolean;
  isDelayed: boolean;
  lastUpdated: string | null;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const LiveIndicator: React.FC<LiveIndicatorProps> = ({
  isLive,
  isDelayed,
  lastUpdated,
  onRefresh,
  isLoading
}) => {
  const [secondsAgo, setSecondsAgo] = useState<number>(0);

  useEffect(() => {
    const updateTime = () => {
      if (!lastUpdated) {
        setSecondsAgo(0);
        return;
      }
      const now = Date.now();
      const last = new Date(lastUpdated).getTime();
      const diffSec = Math.max(0, Math.floor((now - last) / 1000));
      setSecondsAgo(diffSec);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const formatTimeAgo = (sec: number): string => {
    if (sec < 5) return 'just now';
    if (sec < 60) return `${sec} seconds ago`;
    const min = Math.floor(sec / 60);
    if (min === 1) return '1 minute ago';
    if (min < 60) return `${min} minutes ago`;
    const hours = Math.floor(min / 60);
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (isDelayed) {
    return (
      <div id="live-indicator-delayed" className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-amber-950/40 border border-amber-500/30 text-xs font-mono tracking-wider">
        <span className="relative flex h-2 w-2">
          <span className="h-2 w-2 rounded-full bg-amber-500"></span>
        </span>
        <span className="font-bold text-amber-400">DATA DELAYED</span>
        <span className="text-zinc-400">·</span>
        <span className="text-zinc-400">
          Last record: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : 'Unavailable'}
        </span>
        {onRefresh && (
          <button
            id="refresh-delayed-btn"
            onClick={onRefresh}
            disabled={isLoading}
            className="ml-1 text-amber-300 hover:text-amber-100 underline decoration-dotted transition-colors cursor-pointer"
            title="Retry connecting to NOAA stream"
          >
            {isLoading ? 'Checking...' : 'Retry'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div id="live-indicator-active" className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-emerald-950/30 border border-emerald-500/30 text-xs font-mono tracking-wider">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <span className="font-bold text-emerald-400">LIVE</span>
      <span className="text-zinc-600">·</span>
      <span className="text-zinc-300">
        Last updated: {formatTimeAgo(secondsAgo)}
      </span>
      {onRefresh && (
        <button
          id="refresh-live-btn"
          onClick={onRefresh}
          disabled={isLoading}
          className="ml-1 text-zinc-400 hover:text-cyan-300 transition-colors cursor-pointer text-[11px]"
          title="Force poll latest buoy telemetry"
        >
          {isLoading ? 'Updating...' : 'Poll'}
        </button>
      )}
    </div>
  );
};

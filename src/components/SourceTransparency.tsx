import React from 'react';
import { StationInfo } from '../types';
import { ExternalLink, Compass, Database, Clock, Info } from 'lucide-react';

interface SourceTransparencyProps {
  station: StationInfo;
  dataSourceName: string;
  dataSourceUrl: string;
  lastObservationTime: string | null;
  metric: string;
}

export const SourceTransparency: React.FC<SourceTransparencyProps> = ({
  station,
  dataSourceName,
  dataSourceUrl,
  lastObservationTime,
  metric
}) => {
  const formatCoord = (lat: number, lon: number) => {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(3)}° ${latDir}, ${Math.abs(lon).toFixed(3)}° ${lonDir}`;
  };

  return (
    <div id="source-transparency-card" className="rounded-2xl bg-zinc-950/70 border border-zinc-900 p-5 font-mono text-xs text-zinc-400">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-900">
        <div className="flex items-center gap-2 text-zinc-300 font-semibold uppercase tracking-wider text-[11px]">
          <Info className="h-3.5 w-3.5 text-cyan-400" />
          <span>Source & Telemetry Transparency</span>
        </div>
        <a
          id="data-source-official-link"
          href={dataSourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 text-[11px] underline decoration-cyan-500/40 hover:decoration-cyan-300 transition-colors"
        >
          Data source <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Station name */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
            Station Name & ID
          </div>
          <div className="text-zinc-200 font-bold text-sm">
            {station.name}
          </div>
          <div className="text-[11px] text-zinc-500">
            Station #{station.id} {station.depth ? `· Depth: ${station.depth}` : ''}
          </div>
        </div>

        {/* Location & Coordinates */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
            Location & Coordinates
          </div>
          <div className="text-zinc-200 font-medium truncate" title={station.location}>
            {station.location}
          </div>
          <div className="text-[11px] text-zinc-400 flex items-center gap-1">
            <Compass className="h-3 w-3 text-cyan-500 shrink-0" />
            {formatCoord(station.lat, station.lon)}
          </div>
        </div>

        {/* Data source */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
            Data Source
          </div>
          <div className="text-zinc-200 font-medium flex items-center gap-1.5">
            <Database className="h-3 w-3 text-emerald-400" />
            <span>{dataSourceName}</span>
          </div>
          <div className="text-[11px] text-zinc-500">
            Standard Marine Meteorological (WVHT)
          </div>
        </div>

        {/* Last observation */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
            Last Observation
          </div>
          <div className="text-zinc-200 font-medium flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-amber-400" />
            <span>
              {lastObservationTime
                ? new Date(lastObservationTime).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZoneName: 'short'
                  })
                : 'Pending'}
            </span>
          </div>
          <div className="text-[11px] text-zinc-500">
            Metric: {metric}
          </div>
        </div>
      </div>
    </div>
  );
};

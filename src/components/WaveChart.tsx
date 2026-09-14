import React, { useState, useMemo, useRef } from 'react';
import { NormalizedObservation, NormalizedEvent, TimeRange } from '../types';

interface WaveChartProps {
  observations: NormalizedObservation[];
  events: NormalizedEvent[];
  threshold: number;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  unit: string;
  metric: string;
}

export const WaveChart: React.FC<WaveChartProps> = ({
  observations,
  events,
  threshold,
  timeRange,
  onTimeRangeChange,
  unit,
  metric
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Filter observations by selected time range
  const filteredData = useMemo(() => {
    if (!observations || observations.length === 0) return [];

    const latestTime = new Date(observations[observations.length - 1].timestamp).getTime();
    let windowMs = 24 * 60 * 60 * 1000; // default 24H

    switch (timeRange) {
      case '1H':
        windowMs = 1 * 60 * 60 * 1000;
        break;
      case '6H':
        windowMs = 6 * 60 * 60 * 1000;
        break;
      case '24H':
        windowMs = 24 * 60 * 60 * 1000;
        break;
      case '7D':
        windowMs = 7 * 24 * 60 * 60 * 1000;
        break;
    }

    const cutoffTime = latestTime - windowMs;
    const subset = observations.filter(
      obs => new Date(obs.timestamp).getTime() >= cutoffTime
    );

    // If subset is too sparse (e.g. in 1H if buoy only reports hourly), ensure at least 2 points
    return subset.length >= 2 ? subset : observations.slice(-Math.max(6, subset.length));
  }, [observations, timeRange]);

  // Chart dimensions & scaling
  const chartHeight = 280;
  const padding = { top: 28, right: 24, bottom: 36, left: 56 };

  const { minVal, maxVal, minTime, maxTime, points, thresholdY } = useMemo(() => {
    if (filteredData.length === 0) {
      return { minVal: 0, maxVal: 5, minTime: 0, maxTime: 1, points: [], thresholdY: 0 };
    }

    const times = filteredData.map(d => new Date(d.timestamp).getTime());
    const values = filteredData.map(d => d.value);

    const dataMinVal = Math.min(...values);
    const dataMaxVal = Math.max(...values, threshold);

    // Give head-room for styling
    const chartMinVal = Math.max(0, Math.floor(dataMinVal * 0.8 * 10) / 10);
    const chartMaxVal = Math.ceil((dataMaxVal + 0.5) * 10) / 10;

    const tMin = Math.min(...times);
    const tMax = Math.max(...times);

    // Compute coordinate points normalized across 1000 virtual width units
    const width = 1000;
    const innerW = width - padding.left - padding.right;
    const innerH = chartHeight - padding.top - padding.bottom;

    const valSpan = chartMaxVal - chartMinVal || 1;
    const timeSpan = tMax - tMin || 1;

    const calculatedPoints = filteredData.map((d, i) => {
      const t = new Date(d.timestamp).getTime();
      const x = padding.left + ((t - tMin) / timeSpan) * innerW;
      const y = padding.top + innerH - ((d.value - chartMinVal) / valSpan) * innerH;
      const isAbove = d.value >= threshold;
      return { x, y, data: d, isAbove, index: i };
    });

    const threshY = padding.top + innerH - ((threshold - chartMinVal) / valSpan) * innerH;

    return {
      minVal: chartMinVal,
      maxVal: chartMaxVal,
      minTime: tMin,
      maxTime: tMax,
      points: calculatedPoints,
      thresholdY: threshY
    };
  }, [filteredData, threshold, chartHeight]);

  // Path generators
  const linePath = useMemo(() => {
    if (points.length === 0) return '';
    return points.reduce((acc, p, i) => {
      return i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `${acc} L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }, '');
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const bottomY = chartHeight - padding.bottom;
    const firstX = points[0].x.toFixed(1);
    const lastX = points[points.length - 1].x.toFixed(1);
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [points, linePath, chartHeight, padding.bottom]);

  // Generate event zones (segments where value >= threshold)
  const eventSegments = useMemo(() => {
    if (points.length < 2) return [];
    const segments: Array<{ startX: number; endX: number; peakVal: number }> = [];
    let activeStart: number | null = null;
    let peak = 0;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.isAbove) {
        if (activeStart === null) activeStart = p.x;
        peak = Math.max(peak, p.data.value);
      } else {
        if (activeStart !== null) {
          segments.push({ startX: activeStart, endX: points[i - 1].x, peakVal: peak });
          activeStart = null;
          peak = 0;
        }
      }
    }
    if (activeStart !== null) {
      segments.push({ startX: activeStart, endX: points[points.length - 1].x, peakVal: peak });
    }
    return segments;
  }, [points]);

  // Y-axis tick values
  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = (maxVal - minVal) / 4;
    for (let i = 0; i <= 4; i++) {
      ticks.push(parseFloat((minVal + i * step).toFixed(2)));
    }
    return ticks;
  }, [minVal, maxVal]);

  // Time formatting for X-axis
  const formatTimeTick = (timestampMs: number): string => {
    const d = new Date(timestampMs);
    if (timeRange === '7D') {
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const xTicks = useMemo(() => {
    if (minTime === maxTime) return [];
    const span = maxTime - minTime;
    return [0, 0.25, 0.5, 0.75, 1].map(pct => {
      const t = minTime + span * pct;
      const x = padding.left + pct * (1000 - padding.left - padding.right);
      return { x, label: formatTimeTick(t) };
    });
  }, [minTime, maxTime, timeRange]);

  // Handle pointer scrub
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current || points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = (e.clientX - rect.left) / rect.width;
    const svgX = relativeX * 1000;

    // Find closest point
    let closestIdx = 0;
    let minDiff = Infinity;
    points.forEach((p, idx) => {
      const diff = Math.abs(p.x - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    setHoverIndex(closestIdx);
  };

  const activeHoverPoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;

  return (
    <div id="wave-chart-container" className="relative w-full rounded-2xl bg-zinc-950/80 border border-zinc-800/80 p-5 sm:p-6 backdrop-blur-md">
      {/* Chart Header & Range Switches */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-cyan-400"></div>
          <div>
            <h3 className="text-sm font-semibold tracking-wider uppercase text-zinc-300">
              Significant Wave Height Telemetry
            </h3>
            <p className="text-xs text-zinc-500 font-mono">
              Continuous NDBC sensor observations vs {threshold.toFixed(2)}{unit} event threshold
            </p>
          </div>
        </div>

        {/* Time range buttons */}
        <div id="time-range-selector" className="inline-flex items-center p-1 rounded-lg bg-zinc-900 border border-zinc-800 self-start sm:self-auto">
          {(['1H', '6H', '24H', '7D'] as TimeRange[]).map(range => (
            <button
              key={range}
              id={`range-btn-${range.toLowerCase()}`}
              onClick={() => onTimeRangeChange(range)}
              className={`px-3 py-1 rounded text-xs font-mono transition-all cursor-pointer ${
                timeRange === range
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative w-full overflow-hidden" ref={containerRef}>
        <svg
          viewBox="0 0 1000 280"
          className="w-full h-[240px] sm:h-[280px] select-none cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            {/* Ambient area gradient below normal curve */}
            <linearGradient id="waveAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
              <stop offset="70%" stopColor="#06b6d4" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
            </linearGradient>

            {/* High-wave alert gradient for areas above threshold */}
            <linearGradient id="alertAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
            </linearGradient>

            <pattern id="gridLines" width="100" height="40" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 40" fill="none" stroke="#27272a" strokeWidth="0.5" strokeDasharray="2 4" />
            </pattern>
          </defs>

          {/* Background Grid */}
          <rect x={padding.left} y={padding.top} width={1000 - padding.left - padding.right} height={chartHeight - padding.top - padding.bottom} fill="url(#gridLines)" opacity="0.6" />

          {/* Y-axis tick lines */}
          {yTicks.map((tickVal, i) => {
            const yPos = padding.top + (chartHeight - padding.top - padding.bottom) - ((tickVal - minVal) / (maxVal - minVal || 1)) * (chartHeight - padding.top - padding.bottom);
            return (
              <g key={`y-tick-${i}`}>
                <line
                  x1={padding.left}
                  y1={yPos}
                  x2={1000 - padding.right}
                  y2={yPos}
                  stroke="#27272a"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={padding.left - 10}
                  y={yPos + 4}
                  textAnchor="end"
                  className="fill-zinc-500 font-mono text-[11px]"
                >
                  {tickVal.toFixed(1)} {unit}
                </text>
              </g>
            );
          })}

          {/* High Wave Event Highlight Zones (24H View Clarity) */}
          {eventSegments.map((seg, idx) => (
            <g key={`event-seg-${idx}`}>
              <rect
                x={seg.startX}
                y={padding.top}
                width={Math.max(6, seg.endX - seg.startX)}
                height={chartHeight - padding.top - padding.bottom}
                fill="#f59e0b"
                opacity="0.12"
              />
              <line
                x1={seg.startX}
                y1={padding.top}
                x2={seg.startX}
                y2={chartHeight - padding.bottom}
                stroke="#f59e0b"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.6"
              />
            </g>
          ))}

          {/* Base wave height area fill */}
          {areaPath && (
            <path d={areaPath} fill="url(#waveAreaGradient)" />
          )}

          {/* Wave Height Curve */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Horizontal Event Threshold Line */}
          {thresholdY >= padding.top && thresholdY <= chartHeight - padding.bottom && (
            <g id="threshold-line-group">
              <line
                x1={padding.left}
                y1={thresholdY}
                x2={1000 - padding.right}
                y2={thresholdY}
                stroke="#f59e0b"
                strokeWidth="2"
                strokeDasharray="6 4"
                className="transition-all duration-300"
              />
              <rect
                x={1000 - padding.right - 145}
                y={thresholdY - 14}
                width="145"
                height="20"
                rx="4"
                fill="#78350f"
                fillOpacity="0.9"
                stroke="#f59e0b"
                strokeWidth="1"
              />
              <text
                x={1000 - padding.right - 72}
                y={thresholdY}
                textAnchor="middle"
                className="fill-amber-200 font-mono font-bold text-[10px] tracking-wider"
              >
                EVENT THRESHOLD: {threshold.toFixed(2)} {unit}
              </text>
            </g>
          )}

          {/* Event Trigger Markers on Data Points */}
          {points.map((p, i) => {
            if (!p.isAbove) return null;
            return (
              <circle
                key={`point-${i}`}
                cx={p.x}
                cy={p.y}
                r="3.5"
                fill="#f59e0b"
                stroke="#090d14"
                strokeWidth="1.5"
                className="animate-pulse"
              />
            );
          })}

          {/* X-axis ticks */}
          {xTicks.map((tick, i) => (
            <g key={`x-tick-${i}`}>
              <line
                x1={tick.x}
                y1={chartHeight - padding.bottom}
                x2={tick.x}
                y2={chartHeight - padding.bottom + 5}
                stroke="#3f3f46"
                strokeWidth="1"
              />
              <text
                x={tick.x}
                y={chartHeight - padding.bottom + 18}
                textAnchor="middle"
                className="fill-zinc-500 font-mono text-[11px]"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Interactive hover line & marker */}
          {activeHoverPoint && (
            <g id="hover-marker-group">
              <line
                x1={activeHoverPoint.x}
                y1={padding.top}
                x2={activeHoverPoint.x}
                y2={chartHeight - padding.bottom}
                stroke="#a1a1aa"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle
                cx={activeHoverPoint.x}
                cy={activeHoverPoint.y}
                r="6"
                fill={activeHoverPoint.isAbove ? '#f59e0b' : '#06b6d4'}
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {/* Floating Tooltip */}
        {activeHoverPoint && (
          <div
            className="pointer-events-none absolute z-20 px-3 py-2 rounded-lg bg-zinc-900/95 border border-zinc-700 shadow-2xl backdrop-blur-md text-xs font-mono transform -translate-x-1/2 -translate-y-full"
            style={{
              left: `${(activeHoverPoint.x / 1000) * 100}%`,
              top: `${(activeHoverPoint.y / chartHeight) * 100}%`,
              marginTop: '-12px'
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-zinc-400">
                {new Date(activeHoverPoint.data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              {activeHoverPoint.isAbove ? (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/30 border border-amber-500/50 text-amber-300 font-bold text-[10px]">
                  HIGH WAVE
                </span>
              ) : (
                <span className="text-zinc-500 text-[10px]">NORMAL</span>
              )}
            </div>
            <div className="text-sm font-bold text-white">
              {activeHoverPoint.data.value.toFixed(2)} {unit}
            </div>
            {activeHoverPoint.data.dominantPeriod && (
              <div className="text-[11px] text-zinc-400">
                Dominant Period: {activeHoverPoint.data.dominantPeriod}s
              </div>
            )}
            {activeHoverPoint.data.waterTemp !== null && activeHoverPoint.data.waterTemp !== undefined && (
              <div className="text-[11px] text-zinc-400">
                Water Temp: {activeHoverPoint.data.waterTemp}°C
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend & Summary Footer */}
      <div className="flex flex-wrap items-center justify-between gap-4 mt-3 pt-3 border-t border-zinc-900 text-xs font-mono text-zinc-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-cyan-400"></span>
            <span>Wave Height (WVHT)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-amber-400 border-t border-dashed border-amber-400"></span>
            <span>Threshold ({threshold.toFixed(2)}{unit})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400"></span>
            <span>Event Trigger</span>
          </div>
        </div>

        <div className="text-zinc-500">
          Showing {filteredData.length} observations in {timeRange} window
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Sliders, Plus, Minus } from 'lucide-react';

interface ThresholdControlProps {
  threshold: number;
  unit: string;
  presets: number[];
  step: number;
  min: number;
  max: number;
  onChange: (newThreshold: number) => void;
}

export const ThresholdControl: React.FC<ThresholdControlProps> = ({
  threshold,
  unit,
  presets,
  step,
  min,
  max,
  onChange
}) => {
  const handleStep = (delta: number) => {
    const nextVal = Math.min(max, Math.max(min, parseFloat((threshold + delta).toFixed(2))));
    onChange(nextVal);
  };

  return (
    <div id="threshold-control-widget" className="flex flex-wrap items-center gap-2 sm:gap-3 p-2 sm:px-3 sm:py-2 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs font-mono">
      <div className="flex items-center gap-1.5 text-zinc-400">
        <Sliders className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-[11px] uppercase tracking-wider text-zinc-400">Event Threshold:</span>
      </div>

      {/* Stepper */}
      <div className="flex items-center rounded-lg bg-zinc-950 border border-zinc-800">
        <button
          id="threshold-decrement-btn"
          onClick={() => handleStep(-step)}
          disabled={threshold <= min}
          className="px-2 py-1 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
          title="Decrease threshold"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="px-2 text-xs font-bold text-amber-300">
          {threshold.toFixed(2)} {unit}
        </span>
        <button
          id="threshold-increment-btn"
          onClick={() => handleStep(step)}
          disabled={threshold >= max}
          className="px-2 py-1 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
          title="Increase threshold"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Quick Presets */}
      <div className="flex items-center gap-1">
        {presets.map(val => (
          <button
            key={val}
            id={`preset-thresh-${val}`}
            onClick={() => onChange(val)}
            className={`px-2 py-0.5 rounded text-[11px] transition-all cursor-pointer ${
              Math.abs(threshold - val) < 0.01
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {val.toFixed(1)}m
          </button>
        ))}
      </div>
    </div>
  );
};

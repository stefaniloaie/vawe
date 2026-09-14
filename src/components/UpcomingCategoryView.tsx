import React from 'react';
import { CategoryId } from '../types';
import { CATEGORY_DEFINITIONS } from '../sources/SourceRegistry';
import { Radio, ArrowRight, ShieldCheck, Database, Cpu } from 'lucide-react';

interface UpcomingCategoryViewProps {
  category: CategoryId;
  onSelectCategory: (cat: CategoryId) => void;
}

export const UpcomingCategoryView: React.FC<UpcomingCategoryViewProps> = ({
  category,
  onSelectCategory
}) => {
  const catInfo = CATEGORY_DEFINITIONS.find(c => c.id === category) || CATEGORY_DEFINITIONS[0];

  const categoryDetails: Record<string, {
    pipeline: string;
    source: string;
    description: string;
    metrics: string[];
    sampleStory: string;
  }> = {
    AIR: {
      pipeline: 'ADS-B Ingest & Flight Path Vectoring',
      source: 'OpenSky Network / FAA SWIM Stream',
      description: 'Ingests real-time Mode-S and ADS-B transponder messages from high-altitude and terminal airspace sectors. Triggers an event when commercial or cargo aircraft cross a designated geographical geofence or transit corridor.',
      metrics: ['Flight transits', 'Altitude delta', 'Airspeed threshold'],
      sampleStory: '124 commercial flights crossed the SF Oceanic transition corridor today.'
    },
    SHIPS: {
      pipeline: 'AIS Transponder Ingest & Geofence Sentry',
      source: 'U.S. Coast Guard NAIS / MarineTraffic Open Feed',
      description: 'Monitors Class-A and Class-B marine Automatic Identification System (AIS) messages. Computes vessel entry, anchoring, and egress events across marine sanctuaries, port approaches, and shipping channels.',
      metrics: ['Vessel arrivals', 'Speed over ground', 'Deadweight tonnage'],
      sampleStory: '18 container ships entered the Golden Gate traffic separation scheme today.'
    },
    WEATHER: {
      pipeline: 'Mesonet & Doppler High-Wind Radar',
      source: 'National Weather Service / NOAA ASOS',
      description: 'Processes automated surface observing system (ASOS) anemometers and radar wind fields to isolate sustained severe gales and microburst events.',
      metrics: ['Wind gust velocity (> 80 km/h)', 'Barometric pressure drop', 'Precipitation rate'],
      sampleStory: '6 gale-force wind gust events exceeded 80 km/h today.'
    },
    TRAFFIC: {
      pipeline: 'Inductive Loop & Microwave Sensor Stream',
      source: 'Caltrans PeMS / DOT Intelligent Transportation',
      description: 'Translates high-frequency inductive loop detection into lane surge and congestion shockwave events.',
      metrics: ['Vehicle volume surges', 'Occupancy saturation', 'Flow velocity'],
      sampleStory: '14 severe corridor slowdown shockwaves detected today.'
    },
    SPACE: {
      pipeline: 'GOES Primary Solar X-Ray Sensor Feed',
      source: 'NOAA Space Weather Prediction Center (SWPC)',
      description: 'Continuous monitoring of 0.1-0.8 nm solar X-ray irradiance. Detects C, M, and X-class solar flare eruption events affecting high-frequency radio propagation.',
      metrics: ['X-ray irradiance flux', 'Proton flux density', 'Geomagnetic Kp index'],
      sampleStory: '3 M-class solar flare eruption events detected today.'
    }
  };

  const details = categoryDetails[category] || {
    pipeline: 'Universal Event Pipeline',
    source: 'Public Telemetry Feed',
    description: 'Data stream undergoing normalization into the EventDetector architecture.',
    metrics: ['Event crossings', 'Peak thresholds'],
    sampleStory: 'Telemetry events analyzed in real-time.'
  };

  return (
    <div className="py-12 max-w-3xl mx-auto font-mono text-left">
      <div className="p-8 rounded-2xl bg-zinc-950/80 border border-zinc-800 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-cyan-950/50 border border-cyan-500/30 text-cyan-400">
            <Radio className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
              Architectural Pipeline Extension
            </span>
            <h2 className="text-xl font-bold text-white uppercase tracking-tight">
              {catInfo.label} — Telemetry Stream
            </h2>
          </div>
        </div>

        <p className="text-base text-zinc-300 font-sans leading-relaxed mb-6">
          {details.description}
        </p>

        {/* Human story preview */}
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 mb-6">
          <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold mb-1">
            Expected Product Experience
          </div>
          <div className="text-lg font-bold text-white font-sans">
            &ldquo;{details.sampleStory}&rdquo;
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            Question: &ldquo;{catInfo.question}&rdquo;
          </div>
        </div>

        {/* Architectural integration specs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mb-8">
          <div className="p-3 rounded-lg bg-zinc-900/30 border border-zinc-850">
            <div className="flex items-center gap-1.5 text-zinc-400 font-bold uppercase text-[10px] mb-1">
              <Database className="h-3 w-3 text-cyan-400" />
              Ingest Source
            </div>
            <div className="text-zinc-200">{details.source}</div>
          </div>
          <div className="p-3 rounded-lg bg-zinc-900/30 border border-zinc-850">
            <div className="flex items-center gap-1.5 text-zinc-400 font-bold uppercase text-[10px] mb-1">
              <Cpu className="h-3 w-3 text-emerald-400" />
              Detection Pipeline
            </div>
            <div className="text-zinc-200">{details.pipeline}</div>
          </div>
        </div>

        {/* Call to action */}
        <div className="flex items-center justify-between pt-4 border-t border-zinc-900">
          <div className="flex items-center gap-2 text-zinc-500 text-xs">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>Normalized to standard DataSource schema</span>
          </div>

          <button
            onClick={() => onSelectCategory('OCEAN')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition-colors cursor-pointer"
          >
            <span>Return to Live Ocean Wave MVP</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

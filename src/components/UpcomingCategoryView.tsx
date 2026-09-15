import React, { useEffect, useState } from 'react';
import { CategoryId } from '../types';
import { CATEGORY_DEFINITIONS } from '../sources/SourceRegistry';
import { Radio, ArrowRight, ShieldCheck, Database, Cpu } from 'lucide-react';

interface UpcomingCategoryViewProps {
  category: CategoryId;
  onSelectCategory: (cat: CategoryId) => void;
}

interface BackendCategoryStatus {
  category: string;
  status: 'live' | 'configuration_required';
  source: string;
  sourceUrl?: string;
  message: string;
  requiredEnv?: string[];
  isConfigured: boolean;
  updatedAt?: string;
  metric?: string;
  unit?: string;
  observationCount?: number;
  location?: string;
  latestMeasurement?: {
    value?: number;
    unit?: string;
    timestamp?: string;
    summary?: string;
    classification?: string;
    latestFlareClass?: string;
  };
}

export const UpcomingCategoryView: React.FC<UpcomingCategoryViewProps> = ({
  category,
  onSelectCategory
}) => {
  const catInfo = CATEGORY_DEFINITIONS.find(c => c.id === category) || CATEGORY_DEFINITIONS[0];
  const [backendStatus, setBackendStatus] = useState<BackendCategoryStatus | null>(null);
  const [backendLoading, setBackendLoading] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBackendLoading(true);
    setBackendError(null);

    fetch(`/api/categories/${category.toLowerCase()}`)
      .then(async response => {
        const payload = await response.json();
        if (!response.ok && !payload.status) throw new Error(payload.error || 'Unable to read Django source status.');
        if (!cancelled) setBackendStatus(payload);
      })
      .catch(error => {
        if (!cancelled) setBackendError(error instanceof Error ? error.message : 'Unable to read Django source status.');
      })
      .finally(() => {
        if (!cancelled) setBackendLoading(false);
      });

    return () => { cancelled = true; };
  }, [category]);

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
      sampleStory: 'This connector remains unavailable until an authenticated OpenSky client and an approved airspace query are configured.'
    },
    SHIPS: {
      pipeline: 'AIS Transponder Ingest & Geofence Sentry',
      source: 'U.S. Coast Guard NAIS / MarineTraffic Open Feed',
      description: 'Monitors Class-A and Class-B marine Automatic Identification System (AIS) messages. Computes vessel entry, anchoring, and egress events across marine sanctuaries, port approaches, and shipping channels.',
      metrics: ['Vessel arrivals', 'Speed over ground', 'Deadweight tonnage'],
      sampleStory: 'This connector remains unavailable until a licensed AIS provider and coverage area are configured server-side.'
    },
    WEATHER: {
      pipeline: 'Forecast details',
      source: 'U.S. National Weather Service',
      description: 'See the latest available U.S. National Weather Service hourly forecast for the configured location, including temperature, condition and wind details. Vawe does not present this forecast as a weather-event count.',
      metrics: ['Forecast temperature', 'Short forecast', 'Reported wind field'],
      sampleStory: 'Vawe is showing the latest normalized NWS signal. A weather-event summary appears only after an observed-event detector is configured.'
    },
    TRAFFIC: {
      pipeline: 'Inductive Loop & Microwave Sensor Stream',
      source: 'Caltrans PeMS / DOT Intelligent Transportation',
      description: 'Translates high-frequency inductive loop detection into lane surge and congestion shockwave events.',
      metrics: ['Vehicle volume surges', 'Occupancy saturation', 'Flow velocity'],
      sampleStory: 'This connector remains unavailable until a road-data provider and geographic coverage are configured server-side.'
    },
    SPACE: {
      pipeline: 'GOES Primary Solar X-Ray Sensor Feed',
      source: 'NOAA Space Weather Prediction Center (SWPC)',
      description: 'Continuous monitoring of 0.1-0.8 nm solar X-ray irradiance. Detects C, M, and X-class solar flare eruption events affecting high-frequency radio propagation.',
      metrics: ['X-ray irradiance flux', 'Proton flux density', 'Geomagnetic Kp index'],
      sampleStory: 'Vawe displays the current normalized GOES X-ray signal; it does not claim a flare-event count without an explicit detector.'
    }
  };

  const details = categoryDetails[category] || {
    pipeline: 'Universal Event Pipeline',
    source: 'Public Telemetry Feed',
    description: 'Data stream undergoing normalization into the EventDetector architecture.',
    metrics: ['Event crossings', 'Peak thresholds'],
    sampleStory: 'This source is not yet configured for a public event summary.'
  };
  const isWeather = category === 'WEATHER';
  const sourceMessage = isWeather
    ? `Latest available forecast for ${backendStatus?.location || 'the configured location'}.`
    : backendStatus?.message;

  return (
    <div className={`telemetry-extension telemetry-extension--${category.toLowerCase()} py-12 max-w-3xl mx-auto font-mono text-left`}>
      <div className="telemetry-extension-shell p-8 rounded-2xl bg-zinc-950/80 border border-zinc-800 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-cyan-950/50 border border-cyan-500/30 text-cyan-400">
            <Radio className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
              {isWeather ? 'Live weather data' : 'Architectural Pipeline Extension'}
            </span>
            <h2 className="text-xl font-bold text-white uppercase tracking-tight">
              {isWeather ? 'Weather forecast snapshot' : `${catInfo.label} — Telemetry Stream`}
            </h2>
          </div>
        </div>

        <p className="text-base text-zinc-300 font-sans leading-relaxed mb-6">
          {details.description}
        </p>

        <div className={`mb-6 rounded-xl border p-4 ${backendStatus?.status === 'live' ? 'border-emerald-500/30 bg-emerald-950/25' : 'border-amber-500/30 bg-amber-950/20'}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                <span className={`h-2 w-2 rounded-full ${backendStatus?.status === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className={backendStatus?.status === 'live' ? 'text-emerald-300' : 'text-amber-300'}>{isWeather ? 'Data source' : 'Django source gateway'}</span>
              </div>
              <div className="mt-1 text-sm font-bold text-white">
                {backendLoading ? 'Checking data source…' : backendStatus?.source || 'Source status unavailable'}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                {backendLoading ? 'Checking the latest available source record…' : sourceMessage || backendError}
              </p>
            </div>
            {backendStatus && (
              <span className={`self-start rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${backendStatus.status === 'live' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/30 bg-amber-400/10 text-amber-300'}`}>
                {backendStatus.status === 'live' ? (isWeather ? 'Current forecast' : 'Live via Django') : 'Provider setup'}
              </span>
            )}
          </div>

          {backendStatus?.latestMeasurement && (
            <div className="mt-4 grid gap-3 border-t border-white/10 pt-3 text-xs sm:grid-cols-2">
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-zinc-500">Latest normalized signal</span>
                <span className="mt-1 block font-bold text-cyan-100">
                  {backendStatus.latestMeasurement.value ?? '—'} {backendStatus.latestMeasurement.unit || backendStatus.unit || ''}
                  {backendStatus.latestMeasurement.classification ? ` · ${backendStatus.latestMeasurement.classification}` : ''}
                  {backendStatus.latestMeasurement.summary ? ` · ${backendStatus.latestMeasurement.summary}` : ''}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-zinc-500">Source record</span>
                <span className="mt-1 block font-medium text-zinc-300">
                  {backendStatus.latestMeasurement.timestamp ? new Date(backendStatus.latestMeasurement.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : backendStatus.updatedAt ? new Date(backendStatus.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : 'Pending'}
                </span>
              </div>
            </div>
          )}

          {backendStatus?.status === 'configuration_required' && (
            <div className="mt-4 border-t border-white/10 pt-3 text-xs text-amber-100/75">
              Required server variables: <span className="font-mono text-amber-200">{backendStatus.requiredEnv?.join(', ')}</span>
            </div>
          )}
        </div>

        {/* Human story preview */}
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 mb-6">
          <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold mb-1">
            Current Data Scope
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
            <div className="text-zinc-200">{backendStatus?.source || details.source}</div>
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
            <span>{isWeather ? 'Source values and time shown as reported' : 'Normalized to standard DataSource schema'}</span>
          </div>

          <button
            onClick={() => onSelectCategory('OCEAN')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition-colors cursor-pointer"
          >
            <span>{isWeather ? 'Back to live ocean waves' : 'Return to Live Ocean Wave MVP'}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

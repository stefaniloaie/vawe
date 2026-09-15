import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronDown, CircleAlert, LoaderCircle, MapPin, Trophy, Waves } from 'lucide-react';
import { TimeRange, WaveRankingsResponse } from '../types';

interface WaveAreaRankingsProps {
  timeRange: TimeRange;
  refreshKey?: string | null;
  onSelectStation: (stationId: string) => void;
}

const WINDOW_LABELS: Record<TimeRange, string> = {
  '1H': 'last hour',
  '6H': 'last 6 hours',
  '24H': 'last 24 hours',
  '7D': 'last 7 days',
};

const RANK_STYLES = [
  {
    badge: 'border-amber-200/30 bg-amber-300/15 text-amber-100',
    number: 'text-amber-200',
    bar: 'from-amber-200 via-orange-300 to-rose-400',
    glow: 'shadow-[0_16px_50px_rgba(251,191,36,0.13)]',
    label: 'LEADING PEAK',
  },
  {
    badge: 'border-slate-200/25 bg-slate-100/10 text-slate-100',
    number: 'text-slate-100',
    bar: 'from-slate-200 via-sky-200 to-cyan-300',
    glow: 'shadow-[0_16px_50px_rgba(186,230,253,0.09)]',
    label: 'SECOND PEAK',
  },
  {
    badge: 'border-orange-200/25 bg-orange-300/10 text-orange-100',
    number: 'text-orange-200',
    bar: 'from-orange-200 via-orange-400 to-rose-400',
    glow: 'shadow-[0_16px_50px_rgba(251,146,60,0.08)]',
    label: 'THIRD PEAK',
  },
];

const formatObservedAt = (timestamp: string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'time unavailable';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  });
};

export function WaveAreaRankings({ timeRange, refreshKey, onSelectStation }: WaveAreaRankingsProps) {
  const [data, setData] = useState<WaveRankingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const loadRankings = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/ocean/rankings?window=${encodeURIComponent(timeRange)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('The buoy comparison is unavailable right now.');
        const payload: WaveRankingsResponse = await response.json();
        if (!controller.signal.aborted) setData(payload);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Unable to load the buoy comparison.');
          setData(null);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    loadRankings();
    return () => controller.abort();
  }, [timeRange, refreshKey]);

  const topPeak = useMemo(
    () => Math.max(...(data?.rankings.map((ranking) => ranking.peakWaveHeight) || [1])),
    [data],
  );

  return (
    <section
      id="wave-area-rankings"
      aria-labelledby="wave-area-rankings-title"
      className="overflow-hidden rounded-3xl border border-cyan-100/15 bg-[#092238]/75 shadow-[0_20px_65px_rgba(3,18,33,0.28)] backdrop-blur-xl"
    >
      <div className={`relative overflow-hidden px-5 py-5 sm:px-6 ${isOpen ? 'border-b border-cyan-100/10' : ''}`}>
        <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-violet-300/10 blur-3xl" />
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-controls="wave-area-rankings-content"
          className="relative flex w-full flex-col gap-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-100/70 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-cyan-100/55">
              <Trophy className="h-3.5 w-3.5 text-amber-200" />
              LIVE OCEAN COMPARISON
            </div>
            <h2 id="wave-area-rankings-title" className="text-xl font-black tracking-tight text-white sm:text-2xl">
              Top 3 wave areas
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-cyan-50/65">
              Largest observed significant-wave-height peak in the {WINDOW_LABELS[timeRange]}.
            </p>
          </div>
          <span className="flex self-start items-center gap-2 rounded-full border border-cyan-100/15 bg-cyan-100/5 px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider text-cyan-100/70 transition hover:border-cyan-100/30 hover:text-cyan-50 sm:self-auto">
            {timeRange} · {isOpen ? 'HIDE' : 'OPEN'}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </span>
        </button>
      </div>

      {isOpen && <div id="wave-area-rankings-content" className="p-4 sm:p-5">
        {isLoading && (
          <div className="flex min-h-44 items-center justify-center gap-3 text-sm text-cyan-50/65">
            <LoaderCircle className="h-5 w-5 animate-spin text-cyan-200" />
            Comparing the latest buoy records…
          </div>
        )}

        {!isLoading && error && (
          <div className="flex min-h-44 items-center justify-center gap-3 rounded-2xl border border-rose-300/20 bg-rose-950/20 px-5 text-sm text-rose-100/80">
            <CircleAlert className="h-5 w-5 shrink-0 text-rose-200" />
            {error}
          </div>
        )}

        {!isLoading && !error && data && data.rankings.length === 0 && (
          <div className="flex min-h-44 items-center justify-center gap-3 rounded-2xl border border-cyan-100/10 bg-[#071b2d]/65 px-5 text-sm text-cyan-50/65">
            <Waves className="h-5 w-5 text-cyan-200" />
            No curated buoy returned a usable reading in this window.
          </div>
        )}

        {!isLoading && !error && data && data.rankings.length > 0 && (
          <>
            <div className="grid gap-3 lg:grid-cols-3">
              {data.rankings.map((ranking, index) => {
                const style = RANK_STYLES[index] || RANK_STYLES[RANK_STYLES.length - 1];
                const barWidth = Math.max(16, Math.round((ranking.peakWaveHeight / topPeak) * 100));
                return (
                  <article
                    key={ranking.station.id}
                    className={`group relative overflow-hidden rounded-2xl border border-cyan-100/12 bg-[#071b2d]/75 p-4 transition duration-300 hover:-translate-y-0.5 hover:border-cyan-100/25 ${style.glow}`}
                  >
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-100/30 to-transparent" />
                    <div className="flex items-start justify-between gap-3">
                      <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-black tracking-wider ${style.badge}`}>
                        #{index + 1} {style.label}
                      </span>
                      {ranking.isDelayed && <span className="font-mono text-[9px] uppercase tracking-wider text-amber-200/80">Delayed feed</span>}
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectStation(ranking.station.id)}
                      className="mt-5 block text-left outline-none focus-visible:ring-2 focus-visible:ring-cyan-100/70"
                      aria-label={`Inspect ${ranking.station.name}`}
                    >
                      <h3 className="text-lg font-black tracking-tight text-white transition group-hover:text-cyan-100">
                        {ranking.station.name}
                      </h3>
                      <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-cyan-50/55">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-200/65" />
                        {ranking.station.location}
                      </p>
                    </button>

                    <div className="mt-6 flex items-end justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-50/40">Peak observed</p>
                        <p className={`mt-1 font-mono text-4xl font-black tracking-tighter ${style.number}`}>
                          {ranking.peakWaveHeight.toFixed(2)}<span className="ml-1 text-base tracking-normal">{ranking.unit}</span>
                        </p>
                      </div>
                      <ArrowUpRight className="mb-1 h-5 w-5 text-cyan-100/45 transition group-hover:text-cyan-100" />
                    </div>

                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-cyan-100/10">
                      <div className={`h-full rounded-full bg-gradient-to-r ${style.bar}`} style={{ width: `${barWidth}%` }} />
                    </div>
                    <p className="mt-3 font-mono text-[10px] text-cyan-50/45">
                      Peak reported {formatObservedAt(ranking.peakObservedAt)}
                    </p>
                  </article>
                );
              })}
            </div>

            <p className="mt-4 text-xs leading-relaxed text-cyan-50/50">
              Comparing {data.stationsReporting} reporting buoy locations. Each rank is one monitored location’s highest reported value, not a forecast, warning, or area-wide average.
            </p>
          </>
        )}
      </div>}
    </section>
  );
}

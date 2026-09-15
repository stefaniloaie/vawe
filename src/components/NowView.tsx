import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUpRight, Clock3, Earth, LoaderCircle, MapPin, Plane, Radio, Ship, Waves, Wind } from 'lucide-react';
import { NowDomain, NowEvent, NowEventStatus, NowFeedResponse, NowProviderStatus } from '../types';

type DomainFilter = 'ALL' | NowDomain;
type StatusFilter = 'ALL' | NowEventStatus;

const DOMAINS: NowDomain[] = ['EARTH', 'OCEAN', 'WEATHER', 'AIR', 'SHIPS'];

const domainIcon = (domain: NowDomain, className = 'h-4 w-4') => {
  const props = { className };
  if (domain === 'EARTH') return <Earth {...props} />;
  if (domain === 'OCEAN') return <Waves {...props} />;
  if (domain === 'WEATHER') return <Wind {...props} />;
  if (domain === 'AIR') return <Plane {...props} />;
  return <Ship {...props} />;
};

const domainColor: Record<NowDomain, string> = {
  EARTH: 'text-orange-200',
  OCEAN: 'text-cyan-200',
  WEATHER: 'text-sky-200',
  AIR: 'text-violet-200',
  SHIPS: 'text-emerald-200',
};

const relativeTime = (timestamp?: string | null) => {
  if (!timestamp) return 'time unavailable';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'time unavailable';
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
};

const utcTime = (timestamp: string) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });

const filtersFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const candidateDomain = params.get('domain')?.toUpperCase() as DomainFilter | undefined;
  const candidateStatus = params.get('status')?.toUpperCase() as StatusFilter | undefined;
  return {
    domain: candidateDomain && ['ALL', ...DOMAINS].includes(candidateDomain) ? candidateDomain : 'ALL' as DomainFilter,
    status: candidateStatus && ['ALL', 'LIVE', 'RECENT'].includes(candidateStatus) ? candidateStatus : 'ALL' as StatusFilter,
    multi: params.get('multi') === 'true',
  };
};

const markerPosition = (event: NowEvent) => ({
  left: `${Math.max(4, Math.min(96, ((event.longitude + 180) / 360) * 100))}%`,
  top: `${Math.max(8, Math.min(88, ((90 - event.latitude) / 180) * 100))}%`,
});

interface NowViewProps {
  onOpenEvent?: (eventId: string) => void;
}

export function NowView({ onOpenEvent }: NowViewProps) {
  const [filters, setFilters] = useState(filtersFromUrl);
  const [feed, setFeed] = useState<NowFeedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.domain !== 'ALL') params.set('domain', filters.domain.toLowerCase());
    if (filters.status !== 'ALL') params.set('status', filters.status.toLowerCase());
    if (filters.multi) params.set('multi', 'true');
    return params;
  }, [filters]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/events/live${query.size ? `?${query.toString()}` : ''}`);
      if (!response.ok) throw new Error('The live world feed is temporarily unavailable.');
      const payload: NowFeedResponse = await response.json();
      setFeed(payload);
      setSelectedId((current) => current && payload.events.some((event) => event.id === current) ? current : payload.events[0]?.id || null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load the live world feed.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const url = query.size ? `/now?${query.toString()}` : '/now';
    window.history.replaceState(null, '', url);
    load();
    const interval = window.setInterval(load, 45000);
    return () => window.clearInterval(interval);
  }, [load, query]);

  const selected = feed?.events.find((event) => event.id === selectedId) || feed?.events[0] || null;
  const providerByDomain = useMemo(() => new Map<NowDomain, NowProviderStatus>((feed?.providers || []).map((provider) => [provider.domain, provider])), [feed]);
  const setFilter = (next: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...next }));

  return (
    <div className="space-y-8 pb-4">
      <section className="relative overflow-hidden rounded-3xl border border-cyan-100/15 bg-[#071b2d]/80 px-5 py-7 shadow-[0_24px_75px_rgba(1,15,30,0.32)] backdrop-blur-xl sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-24 -top-36 h-80 w-80 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-px w-2/3 bg-gradient-to-r from-transparent via-cyan-100/35 to-transparent" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/55">
            <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-300" />
            Live world signals
          </div>
          <div className="mt-4 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <h1 className="max-w-3xl text-3xl font-black tracking-tight text-white sm:text-5xl">What&apos;s happening right now?</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cyan-50/65 sm:text-base">Live signals detected across Earth, ocean, air, ships and weather. Only observed events appear in the feed; unavailable and forecast-only sources are labeled.</p>
            </div>
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-5 py-4 font-mono text-right">
              <div className="flex items-center justify-end gap-2 text-[10px] font-bold tracking-[0.18em] text-emerald-200"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> LIVE</div>
              <div className="mt-1 text-3xl font-black text-white">{feed?.activeEventCount ?? '—'} <span className="text-xs font-bold tracking-wider text-cyan-50/55">ACTIVE EVENTS</span></div>
              <div className="mt-2 text-[10px] uppercase tracking-wider text-cyan-50/45">Updated {relativeTime(feed?.updatedAt)}</div>
            </div>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {DOMAINS.map((domain) => {
              const provider = providerByDomain.get(domain);
              const count = feed?.counts[domain];
              const label = provider?.status === 'unavailable' ? 'Unavailable' : provider?.status === 'forecast_only' ? 'Forecast only' : count ?? '—';
              return <div key={domain} className="rounded-xl border border-cyan-100/10 bg-cyan-100/[0.035] px-3 py-3">
                <div className={`flex items-center gap-1.5 text-[10px] font-bold tracking-wider ${domainColor[domain]}`}>{domainIcon(domain, 'h-3.5 w-3.5')} {domain}</div>
                <div className="mt-1 font-mono text-sm font-black text-white">{label}</div>
              </div>;
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="overflow-hidden rounded-3xl border border-cyan-100/15 bg-[#071b2d]/80 shadow-[0_20px_65px_rgba(2,14,30,0.28)]">
          <div className="border-b border-cyan-100/10 px-5 py-5 sm:px-6">
            <div className="text-[10px] font-black tracking-[0.2em] text-cyan-100/50">MOST SIGNIFICANT RIGHT NOW</div>
          </div>
          {loading && <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-cyan-50/60"><LoaderCircle className="h-5 w-5 animate-spin text-cyan-200" /> Reading current provider signals…</div>}
          {!loading && error && <div className="m-5 rounded-2xl border border-amber-200/20 bg-amber-950/20 p-5 text-sm text-amber-100/80">{error}</div>}
          {!loading && !error && !selected && <div className="p-6"><h2 className="text-2xl font-black text-white">Quiet right now</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-cyan-50/60">No significant cross-domain events are currently detected. Signal Atlas is still monitoring available ocean and earthquake sources; AIR and SHIPS remain clearly marked until real regional providers are configured.</p></div>}
          {!loading && !error && selected && <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-black tracking-wider ${selected.status === 'LIVE' ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200' : 'border-cyan-200/25 bg-cyan-100/10 text-cyan-100'}`}>{selected.status === 'LIVE' ? 'HAPPENING NOW' : 'RECENT'}</span><span className="font-mono text-[10px] text-cyan-50/45">SIGNIFICANCE {selected.significance}/100</span></div>
            <div className="mt-5 flex items-start justify-between gap-5"><div><h2 className="text-3xl font-black tracking-tight text-white">{selected.title}</h2><p className="mt-2 text-sm leading-relaxed text-cyan-50/65">{selected.summary}</p></div><div className="rounded-xl border border-cyan-100/10 bg-cyan-100/5 p-3 text-cyan-100/80">{domainIcon(selected.domains[0], 'h-6 w-6')}</div></div>
            <div className="mt-6 flex flex-wrap gap-2">{selected.domains.map((domain) => <span key={domain} className={`inline-flex items-center gap-1.5 rounded-full border border-cyan-100/10 bg-cyan-100/5 px-2.5 py-1 text-[10px] font-bold ${domainColor[domain]}`}>{domainIcon(domain, 'h-3.5 w-3.5')}{domain}{selected.nearbyObservations[domain] ? ` · ${selected.nearbyObservations[domain]} observed nearby` : ''}</span>)}</div>
            <div className="mt-6 flex flex-col gap-3 border-t border-cyan-100/10 pt-4 text-xs text-cyan-50/55 sm:flex-row sm:items-center sm:justify-between"><span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-cyan-200" />{selected.location}</span><span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-cyan-200" />{relativeTime(selected.timestamp)}</span><a href={`/events/${selected.id}`} className="inline-flex items-center gap-1.5 font-bold text-cyan-100 transition hover:text-white" onClick={(click) => { if (onOpenEvent) { click.preventDefault(); onOpenEvent(selected.id); } }}>Explore event <ArrowUpRight className="h-3.5 w-3.5" /></a></div>
          </div>}
        </div>

        <aside className="overflow-hidden rounded-3xl border border-cyan-100/15 bg-[#071b2d]/80 shadow-[0_20px_65px_rgba(2,14,30,0.28)]">
          <div className="px-5 py-5"><div className="text-[10px] font-black tracking-[0.2em] text-cyan-100/50">WORLD EVENT CONTEXT</div><p className="mt-2 text-xs leading-relaxed text-cyan-50/55">Markers represent detected events, not individual aircraft or vessels.</p></div>
          <div className="relative mx-5 mb-5 aspect-[1.65] overflow-hidden rounded-2xl border border-cyan-100/10 bg-[radial-gradient(ellipse_at_center,rgba(29,97,127,0.28),rgba(3,14,29,0.88)_68%)]">
            <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(165,243,252,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(165,243,252,0.12)_1px,transparent_1px)] [background-size:20%_25%]" />
            {(feed?.events || []).map((event) => <button key={event.id} type="button" onClick={() => setSelectedId(event.id)} style={markerPosition(event)} aria-label={`Focus ${event.title}`} className={`group absolute -translate-x-1/2 -translate-y-1/2 rounded-full border p-1.5 transition ${selectedId === event.id ? 'border-white bg-cyan-200 text-slate-950 shadow-[0_0_22px_rgba(165,243,252,0.75)]' : 'border-cyan-100/45 bg-[#08243a] text-cyan-100 hover:scale-110'}`}>{event.domains.length > 1 ? <Activity className="h-3.5 w-3.5" /> : domainIcon(event.domains[0], 'h-3.5 w-3.5')}</button>)}
            {!feed?.events.length && !loading && <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs leading-relaxed text-cyan-50/45">No current event markers to show.</div>}
          </div>
        </aside>
      </section>

      <section className="rounded-3xl border border-cyan-100/15 bg-[#071b2d]/80 p-4 shadow-[0_20px_65px_rgba(2,14,30,0.22)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-xl font-black text-white">Live world feed</h2><p className="mt-1 text-xs text-cyan-50/55">Ordered by live status, transparent significance, then recency.</p></div><div className="flex flex-wrap gap-2"><div className="flex rounded-xl border border-cyan-100/10 bg-cyan-100/[0.035] p-1">{(['ALL', ...DOMAINS] as DomainFilter[]).map((domain) => <button key={domain} type="button" onClick={() => setFilter({ domain })} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black tracking-wider transition ${filters.domain === domain ? 'bg-cyan-100/15 text-cyan-50' : 'text-cyan-50/45 hover:text-cyan-50'}`}>{domain}</button>)}</div><div className="flex rounded-xl border border-cyan-100/10 bg-cyan-100/[0.035] p-1">{(['ALL', 'LIVE', 'RECENT'] as StatusFilter[]).map((status) => <button key={status} type="button" onClick={() => setFilter({ status })} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black tracking-wider transition ${filters.status === status ? 'bg-cyan-100/15 text-cyan-50' : 'text-cyan-50/45 hover:text-cyan-50'}`}>{status}</button>)}</div><button type="button" onClick={() => setFilter({ multi: !filters.multi })} className={`rounded-xl border px-3 py-1.5 text-[10px] font-black tracking-wider transition ${filters.multi ? 'border-cyan-200/35 bg-cyan-100/15 text-cyan-50' : 'border-cyan-100/10 text-cyan-50/55 hover:text-cyan-50'}`}>MULTI-SIGNAL</button></div></div>
        <div className="mt-5 space-y-3">{!loading && !error && (feed?.events || []).map((event) => <article key={event.id} className={`rounded-2xl border p-4 transition ${selectedId === event.id ? 'border-cyan-100/35 bg-cyan-100/[0.07]' : 'border-cyan-100/10 bg-[#061a2b]/60 hover:border-cyan-100/25'}`}><div className="flex gap-4"><div className="min-w-14 font-mono text-xs font-bold text-cyan-100/55">{utcTime(event.timestamp)}<br /><span className="text-[9px]">UTC</span></div><button type="button" onClick={() => setSelectedId(event.id)} className="min-w-0 flex-1 text-left"><div className="flex flex-wrap items-center gap-2">{event.domains.map((domain) => <span key={domain} className={domainColor[domain]}>{domainIcon(domain, 'h-4 w-4')}</span>)}<span className={`text-[10px] font-black tracking-widest ${event.status === 'LIVE' ? 'text-emerald-200' : 'text-cyan-100/60'}`}>{event.status}</span></div><h3 className="mt-2 text-lg font-black text-white">{event.title}</h3><p className="mt-1 text-sm text-cyan-50/62">{event.summary}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cyan-50/45"><span>{event.location}</span>{Object.entries(event.nearbyObservations).map(([domain, count]) => <span key={domain}>{count} {domain.toLowerCase()} observed nearby</span>)}</div></button><a href={`/events/${event.id}`} className="self-center rounded-xl border border-cyan-100/15 px-3 py-2 text-[10px] font-black tracking-wider text-cyan-100 transition hover:border-cyan-100/40 hover:text-white" onClick={(click) => { if (onOpenEvent) { click.preventDefault(); onOpenEvent(event.id); } }}>VIEW</a></div></article>)}{!loading && !error && feed?.events.length === 0 && <div className="rounded-2xl border border-cyan-100/10 bg-[#061a2b]/60 p-6 text-sm text-cyan-50/60">No events match these filters. This does not mean unavailable providers have zero activity.</div>}</div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2"><article className="rounded-3xl border border-cyan-100/12 bg-[#071b2d]/70 p-5"><h2 className="text-[10px] font-black tracking-[0.2em] text-cyan-100/50">LIVE ACTIVITY</h2><div className="mt-4 space-y-3">{(feed?.activity || []).slice(0, 5).map((item) => <button key={item.id} type="button" disabled={!item.eventId} onClick={() => item.eventId && setSelectedId(item.eventId)} className="flex w-full items-start gap-3 text-left disabled:cursor-default"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cyan-200/70" /><span className="min-w-0 flex-1 text-xs leading-relaxed text-cyan-50/65">{item.message}</span><span className="shrink-0 font-mono text-[10px] text-cyan-50/40">{relativeTime(item.timestamp)}</span></button>)}{!feed?.activity.length && !loading && <p className="text-sm text-cyan-50/50">No provider activity is available right now.</p>}</div></article><article className="rounded-3xl border border-cyan-100/12 bg-[#071b2d]/70 p-5"><h2 className="text-[10px] font-black tracking-[0.2em] text-cyan-100/50">SOURCE COVERAGE</h2><div className="mt-4 space-y-3">{(feed?.providers || []).map((provider) => <div key={provider.domain} className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-xs font-bold text-cyan-50">{domainIcon(provider.domain, 'h-3.5 w-3.5')} {provider.domain} · {provider.source}</div><p className="mt-1 text-xs leading-relaxed text-cyan-50/45">{provider.message || 'Live source available for NOW correlation.'}</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black tracking-wider ${provider.status === 'live' ? 'border-emerald-300/25 text-emerald-200' : 'border-amber-200/20 text-amber-100/75'}`}>{provider.status === 'forecast_only' ? 'FORECAST' : provider.status.toUpperCase()}</span></div>)}</div></article></section>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { ArrowLeft, Clock3, ExternalLink, MapPin, Radio } from 'lucide-react';
import { NowEvent, NowProviderStatus } from '../types';

interface EventDetailViewProps {
  eventId: string;
  onBackToNow: () => void;
}

const relativeTime = (timestamp: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 60000));
  return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
};

export function EventDetailView({ eventId, onBackToNow }: EventDetailViewProps) {
  const [event, setEvent] = useState<NowEvent | null>(null);
  const [providers, setProviders] = useState<NowProviderStatus[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events/${eventId}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'This event is no longer available.');
        if (!cancelled) {
          setEvent(payload.event);
          setProviders(payload.providers || []);
        }
      })
      .catch((requestError) => !cancelled && setError(requestError instanceof Error ? requestError.message : 'Unable to load event details.'));
    return () => { cancelled = true; };
  }, [eventId]);

  if (error) return <div className="mx-auto max-w-3xl rounded-3xl border border-amber-200/20 bg-amber-950/20 p-6 text-amber-100/80"><button type="button" onClick={onBackToNow} className="mb-5 inline-flex items-center gap-2 text-xs font-bold text-cyan-100"><ArrowLeft className="h-4 w-4" /> Back to NOW</button><h1 className="text-2xl font-black">Event unavailable</h1><p className="mt-2 text-sm">{error} Live events expire automatically when their source timestamps are no longer current.</p></div>;
  if (!event) return <div className="flex min-h-64 items-center justify-center gap-3 font-mono text-sm text-cyan-100/70"><Radio className="h-5 w-5 animate-pulse" /> Loading event provenance…</div>;

  return <div className="mx-auto max-w-5xl space-y-6 pb-5">
    <button type="button" onClick={onBackToNow} className="inline-flex items-center gap-2 text-xs font-bold text-cyan-100/75 transition hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to what&apos;s happening now</button>
    <section className="rounded-3xl border border-cyan-100/15 bg-[#071b2d]/80 p-6 shadow-[0_20px_65px_rgba(2,14,30,0.28)] sm:p-8"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-black tracking-wider ${event.status === 'LIVE' ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200' : 'border-cyan-200/25 bg-cyan-100/10 text-cyan-100'}`}>{event.status}</span><span className="font-mono text-[10px] tracking-wider text-cyan-50/45">SIGNIFICANCE {event.significance}/100</span></div><h1 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-5xl">{event.title}</h1><p className="mt-3 max-w-3xl text-base leading-relaxed text-cyan-50/68">{event.summary}</p><div className="mt-6 flex flex-wrap gap-4 text-xs text-cyan-50/55"><span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-cyan-200" />{event.location}</span><span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-cyan-200" />Detected {relativeTime(event.timestamp)}</span></div></section>
    <section className="grid gap-5 lg:grid-cols-2"><article className="rounded-3xl border border-cyan-100/12 bg-[#071b2d]/75 p-5"><h2 className="text-lg font-black text-white">What happened?</h2><div className="mt-4 space-y-3">{(event.events || []).map((item) => <div key={item.id} className="rounded-2xl border border-cyan-100/10 bg-cyan-100/[0.035] p-4"><div className="text-[10px] font-black tracking-[0.18em] text-cyan-100/55">{item.domain} · {item.status}</div><h3 className="mt-1 font-bold text-white">{item.title}</h3><p className="mt-1 text-sm leading-relaxed text-cyan-50/60">{item.summary}</p><p className="mt-2 font-mono text-[10px] text-cyan-50/40">{item.timestamp} · {item.source}</p></div>)}</div></article><article className="rounded-3xl border border-cyan-100/12 bg-[#071b2d]/75 p-5"><h2 className="text-lg font-black text-white">Why are they connected?</h2><p className="mt-3 text-sm leading-relaxed text-cyan-50/65">{event.correlationNote}</p><dl className="mt-5 grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl border border-cyan-100/10 bg-cyan-100/[0.035] p-3"><dt className="text-cyan-50/45">Correlation radius</dt><dd className="mt-1 font-mono font-black text-cyan-100">{event.radiusKm} km</dd></div><div className="rounded-xl border border-cyan-100/10 bg-cyan-100/[0.035] p-3"><dt className="text-cyan-50/45">Time window</dt><dd className="mt-1 font-mono font-black text-cyan-100">±{event.timeWindowMinutes} min</dd></div></dl><p className="mt-4 text-xs leading-relaxed text-cyan-50/45">A nearby signal is an observation within this time and distance window. It does not establish impact, danger, or causation.</p></article></section>
    <section className="rounded-3xl border border-cyan-100/12 bg-[#071b2d]/75 p-5"><h2 className="text-lg font-black text-white">Sources and provenance</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{event.sources.map((source) => <a key={source.name} href={source.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-cyan-100/10 bg-cyan-100/[0.035] p-4 transition hover:border-cyan-100/30"><div className="flex items-center justify-between gap-3"><span className="font-bold text-cyan-50">{source.name}</span><ExternalLink className="h-4 w-4 text-cyan-200" /></div><span className="mt-2 block text-xs text-cyan-50/45">Open source record</span></a>)}</div><p className="mt-5 text-xs text-cyan-50/45">Available source coverage: {providers.map((provider) => `${provider.domain} ${provider.status === 'live' ? 'live' : provider.status === 'forecast_only' ? 'forecast only' : 'unavailable'}`).join(' · ')}</p></section>
  </div>;
}

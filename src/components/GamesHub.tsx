import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Compass, Gamepad2, Gauge, MapPin, Sparkles, Trophy, Waves, XCircle } from 'lucide-react';
import { BuoyDuelGame } from './BuoyDuelGame';
import { GameBuoy } from '../types';

type GameId = 'HUB' | 'DUEL' | 'WAVE_BAND' | 'BUOY_LOCATOR';

interface GamesHubProps {
  onInspectBuoy?: (stationId: string) => void;
}

interface WaveBand {
  id: string;
  label: string;
  range: string;
  min: number;
  max: number;
}

const WAVE_BANDS: WaveBand[] = [
  { id: 'calm', label: 'Calm', range: 'Below 1.0 m', min: 0, max: 1 },
  { id: 'rolling', label: 'Rolling', range: '1.0–2.0 m', min: 1, max: 2 },
  { id: 'active', label: 'Active', range: '2.0–3.0 m', min: 2, max: 3 },
  { id: 'heavy', label: 'Heavy', range: '3.0–5.0 m', min: 3, max: 5 },
  { id: 'extreme', label: 'Extreme', range: '5.0 m or higher', min: 5, max: Number.POSITIVE_INFINITY }
];

const BUOY_REGIONS = [
  { id: 'california', label: 'California coast' },
  { id: 'north-pacific', label: 'North Pacific / Hawaii' },
  { id: 'atlantic', label: 'North Atlantic' },
  { id: 'gulf', label: 'Gulf of Mexico' }
];

const shuffle = <T,>(items: T[]): T[] => [...items].sort(() => Math.random() - 0.5);

const formatRecordTime = (timestamp: string) => new Date(timestamp).toLocaleString([], {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short'
});

const getWaveBand = (height: number) => WAVE_BANDS.find(band => height >= band.min && height < band.max) || WAVE_BANDS[WAVE_BANDS.length - 1];

const getBuoyRegion = (buoy: GameBuoy) => {
  if (buoy.id === '51001') return 'north-pacific';
  if (buoy.id === '42001') return 'gulf';
  if (['41002', '44013', '44007'].includes(buoy.id)) return 'atlantic';
  return 'california';
};

const useLiveBuoys = () => {
  const [buoys, setBuoys] = useState<GameBuoy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/ocean/game/buoys');
        if (!response.ok) throw new Error('Live buoy stream is unavailable right now.');
        const data = await response.json();
        if (!data.buoys?.length) throw new Error('No active buoys are reporting right now.');
        if (!cancelled) setBuoys(data.buoys);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load live buoy data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  return { buoys, loading, error };
};

const LiveGameStatus: React.FC<{ loading: boolean; error: string | null }> = ({ loading, error }) => {
  if (loading) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center gap-4 font-mono text-sm text-cyan-100/70">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
        Loading the live NOAA buoy pool…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/35 bg-rose-950/35 p-5 text-center font-mono text-sm text-rose-100">
        {error}
      </div>
    );
  }

  return null;
};

const WaveBandGame: React.FC = () => {
  const { buoys, loading, error } = useLiveBuoys();
  const [question, setQuestion] = useState<{ buoy: GameBuoy; correct: WaveBand; options: WaveBand[] } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);

  const nextRound = (pool = buoys) => {
    if (!pool.length) return;
    const buoy = pool[Math.floor(Math.random() * pool.length)];
    const correct = getWaveBand(buoy.waveHeight);
    const distractors = shuffle(WAVE_BANDS.filter(band => band.id !== correct.id)).slice(0, 2);
    setQuestion({ buoy, correct, options: shuffle([correct, ...distractors]) });
    setSelected(null);
  };

  useEffect(() => {
    if (buoys.length && !question) nextRound(buoys);
  }, [buoys, question]);

  const choose = (optionId: string) => {
    if (!question || selected) return;
    setSelected(optionId);
    setStreak(current => optionId === question.correct.id ? current + 1 : 0);
  };

  if (loading || error) return <LiveGameStatus loading={loading} error={error} />;
  if (!question) return null;

  const answeredCorrectly = selected === question.correct.id;

  return (
    <section className="mx-auto max-w-3xl space-y-6 font-mono">
      <div className="overflow-hidden rounded-3xl border border-cyan-300/25 bg-[linear-gradient(135deg,rgba(8,52,76,0.96),rgba(7,24,42,0.96))] p-6 shadow-2xl sm:p-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-cyan-100 uppercase"><Gauge className="h-3.5 w-3.5" /> Live wave band</span>
          <span className="text-xs text-cyan-100/65">Streak <strong className="text-amber-300">{streak}</strong></span>
        </div>

        <div className="mt-10 text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/55">Which band matches the latest reading?</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-5xl">{question.buoy.name}</h2>
          <p className="mt-2 text-sm text-cyan-100/65">NOAA #{question.buoy.id} · last record {formatRecordTime(question.buoy.timestamp)}</p>
        </div>

        <div className="mt-9 grid gap-3 sm:grid-cols-3">
          {question.options.map(option => {
            const isSelected = selected === option.id;
            const isCorrect = option.id === question.correct.id;
            const revealClass = selected
              ? isCorrect
                ? 'border-emerald-300/70 bg-emerald-400/20 text-emerald-50'
                : isSelected
                  ? 'border-rose-300/70 bg-rose-400/20 text-rose-50'
                  : 'border-cyan-100/10 bg-[#062035]/55 text-cyan-100/50'
              : 'border-cyan-100/15 bg-[#062035]/70 text-white hover:border-cyan-300/65 hover:bg-cyan-300/10';
            return (
              <button
                key={option.id}
                onClick={() => choose(option.id)}
                disabled={Boolean(selected)}
                className={`rounded-2xl border p-4 text-left transition-all ${revealClass} ${selected ? 'cursor-default' : 'cursor-pointer active:scale-[0.98]'}`}
              >
                <span className="block text-lg font-black">{option.label}</span>
                <span className="mt-1 block text-xs opacity-75">{option.range}</span>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className={`mt-6 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${answeredCorrectly ? 'border-emerald-300/35 bg-emerald-950/45 text-emerald-100' : 'border-rose-300/35 bg-rose-950/45 text-rose-100'}`}>
            <div className="flex items-center gap-2 text-sm">
              {answeredCorrectly ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" /> : <XCircle className="h-5 w-5 shrink-0 text-rose-300" />}
              <span>{answeredCorrectly ? 'Correct.' : 'Not this time.'} The reading is <strong>{question.buoy.waveHeight.toFixed(2)} m</strong> — {question.correct.label}.</span>
            </div>
            <button onClick={() => nextRound()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-2 text-xs font-black text-[#042137] transition-colors hover:bg-cyan-200">
              Next reading <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

const BuoyLocatorGame: React.FC = () => {
  const { buoys, loading, error } = useLiveBuoys();
  const [question, setQuestion] = useState<{ buoy: GameBuoy; correctRegion: string; options: typeof BUOY_REGIONS } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  const nextRound = (pool = buoys) => {
    if (!pool.length) return;
    const buoy = pool[Math.floor(Math.random() * pool.length)];
    const correctRegion = getBuoyRegion(buoy);
    const correct = BUOY_REGIONS.find(region => region.id === correctRegion)!;
    const distractors = shuffle(BUOY_REGIONS.filter(region => region.id !== correctRegion)).slice(0, 2);
    setQuestion({ buoy, correctRegion, options: shuffle([correct, ...distractors]) });
    setSelected(null);
  };

  useEffect(() => {
    if (buoys.length && !question) nextRound(buoys);
  }, [buoys, question]);

  const choose = (regionId: string) => {
    if (!question || selected) return;
    setSelected(regionId);
    if (regionId === question.correctRegion) setScore(current => current + 1);
  };

  if (loading || error) return <LiveGameStatus loading={loading} error={error} />;
  if (!question) return null;

  const isCorrect = selected === question.correctRegion;

  return (
    <section className="mx-auto max-w-3xl space-y-6 font-mono">
      <div className="overflow-hidden rounded-3xl border border-violet-300/25 bg-[linear-gradient(135deg,rgba(36,27,78,0.96),rgba(7,24,42,0.96))] p-6 shadow-2xl sm:p-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-300/30 bg-violet-300/10 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-violet-100 uppercase"><MapPin className="h-3.5 w-3.5" /> Buoy locator</span>
          <span className="text-xs text-violet-100/65">Correct locations <strong className="text-amber-300">{score}</strong></span>
        </div>

        <div className="mt-10 text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-violet-100/55">Where is this active NOAA buoy?</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-5xl">{question.buoy.name}</h2>
          <p className="mt-2 text-sm text-violet-100/65">NOAA #{question.buoy.id} · reporting {question.buoy.waveHeight.toFixed(2)} m waves</p>
        </div>

        <div className="mt-9 grid gap-3 sm:grid-cols-3">
          {question.options.map(option => {
            const isSelected = selected === option.id;
            const isRight = option.id === question.correctRegion;
            const revealClass = selected
              ? isRight
                ? 'border-emerald-300/70 bg-emerald-400/20 text-emerald-50'
                : isSelected
                  ? 'border-rose-300/70 bg-rose-400/20 text-rose-50'
                  : 'border-violet-100/10 bg-[#091d36]/55 text-violet-100/50'
              : 'border-violet-100/15 bg-[#091d36]/70 text-white hover:border-violet-300/65 hover:bg-violet-300/10';
            return (
              <button key={option.id} onClick={() => choose(option.id)} disabled={Boolean(selected)} className={`rounded-2xl border p-4 text-left transition-all ${revealClass} ${selected ? 'cursor-default' : 'cursor-pointer active:scale-[0.98]'}`}>
                <Compass className="mb-4 h-5 w-5 opacity-70" />
                <span className="block text-base font-black">{option.label}</span>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className={`mt-6 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${isCorrect ? 'border-emerald-300/35 bg-emerald-950/45 text-emerald-100' : 'border-rose-300/35 bg-rose-950/45 text-rose-100'}`}>
            <div className="flex items-center gap-2 text-sm">
              {isCorrect ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" /> : <XCircle className="h-5 w-5 shrink-0 text-rose-300" />}
              <span>{isCorrect ? 'Correct.' : 'The answer is'} <strong>{BUOY_REGIONS.find(region => region.id === question.correctRegion)?.label}</strong>. {question.buoy.location}</span>
            </div>
            <button onClick={() => nextRound()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-300 px-4 py-2 text-xs font-black text-[#1b143b] transition-colors hover:bg-violet-200">
              Next buoy <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export const GamesHub: React.FC<GamesHubProps> = ({ onInspectBuoy }) => {
  const [activeGame, setActiveGame] = useState<GameId>('HUB');
  const bestStreak = parseInt(localStorage.getItem('live_events_best_streak') || '0', 10);

  const games: Array<{ id: Exclude<GameId, 'HUB'>; title: string; description: string; badge: string; icon: React.ReactNode; tone: string; action: string }> = [
    {
      id: 'DUEL',
      title: 'Swell Duel',
      description: 'Predict whether the next live buoy has higher or lower waves.',
      badge: 'LIVE DATA',
      icon: <Waves className="h-6 w-6" />,
      tone: 'from-amber-500/25 via-orange-500/10 to-transparent border-amber-400/30 text-amber-200',
      action: 'Start duel'
    },
    {
      id: 'WAVE_BAND',
      title: 'Wave Band',
      description: 'Read a buoy name, then place its latest wave height in the right band.',
      badge: 'LIVE DATA',
      icon: <Gauge className="h-6 w-6" />,
      tone: 'from-cyan-500/25 via-blue-500/10 to-transparent border-cyan-300/30 text-cyan-100',
      action: 'Play bands'
    },
    {
      id: 'BUOY_LOCATOR',
      title: 'Buoy Locator',
      description: 'Match an actively reporting NOAA buoy to the ocean region it monitors.',
      badge: 'GEOGRAPHY',
      icon: <MapPin className="h-6 w-6" />,
      tone: 'from-violet-500/25 via-fuchsia-500/10 to-transparent border-violet-300/30 text-violet-100',
      action: 'Locate buoys'
    }
  ];

  if (activeGame !== 'HUB') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-cyan-100/10 bg-[#08263b]/80 p-4 font-mono shadow-xl backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <button onClick={() => setActiveGame('HUB')} className="inline-flex items-center gap-2 self-start text-xs font-bold text-cyan-100/75 transition-colors hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" /> All ocean games
          </button>
          <div className="flex flex-wrap gap-2">
            {games.map(game => (
              <button key={game.id} onClick={() => setActiveGame(game.id)} className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${activeGame === game.id ? 'border-cyan-200/50 bg-cyan-100/15 text-white' : 'border-white/10 text-cyan-100/55 hover:bg-cyan-100/10 hover:text-white'}`}>
                {game.title}
              </button>
            ))}
          </div>
        </div>

        {activeGame === 'DUEL' && <BuoyDuelGame onInspectBuoy={onInspectBuoy} />}
        {activeGame === 'WAVE_BAND' && <WaveBandGame />}
        {activeGame === 'BUOY_LOCATOR' && <BuoyLocatorGame />}
      </div>
    );
  }

  return (
    <section className="space-y-7 font-mono">
      <div className="relative overflow-hidden rounded-3xl border border-cyan-100/15 bg-[linear-gradient(118deg,rgba(7,42,64,0.94),rgba(18,28,67,0.94))] p-7 shadow-[0_28px_80px_rgba(0,12,28,0.34)] sm:p-10">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-cyan-300/15 blur-3xl" />
        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-100/10 px-3 py-1 text-[10px] font-bold tracking-[0.2em] text-cyan-50 uppercase"><Gamepad2 className="h-3.5 w-3.5" /> VAWE arcade</span>
          <h1 className="mt-5 text-4xl font-black tracking-tight text-white sm:text-6xl">Games made from real ocean signals.</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-cyan-50/70 sm:text-base">Play three quick challenges using live NOAA buoy readings and verified station information. The result is a game; the source data stays visible.</p>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-cyan-100/70">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" /> NOAA live pool</span>
            <span className="text-cyan-100/30">•</span>
            <span>{bestStreak > 0 ? `Your best duel streak: ${bestStreak}` : 'Set your first streak'}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {games.map(game => (
          <button key={game.id} id={`game-card-${game.id.toLowerCase()}`} onClick={() => setActiveGame(game.id)} className={`group overflow-hidden rounded-2xl border bg-gradient-to-br p-5 text-left shadow-lg transition-all hover:-translate-y-1 hover:shadow-2xl ${game.tone}`}>
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-xl border border-current/25 bg-black/10 p-2.5">{game.icon}</span>
              <span className="rounded-full border border-current/30 bg-black/10 px-2 py-1 text-[9px] font-black tracking-[0.14em]">{game.badge}</span>
            </div>
            <h2 className="mt-8 text-2xl font-black text-white">{game.title}</h2>
            <p className="mt-2 min-h-12 text-sm leading-relaxed text-cyan-50/70">{game.description}</p>
            <span className="mt-6 inline-flex items-center gap-2 text-xs font-black text-white">{game.action} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-cyan-100/10 bg-[#08243a]/70 p-5 text-sm text-cyan-100/70 sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-300" /> Every live-data challenge cites the current buoy reading after you answer.</span>
        <span className="inline-flex items-center gap-2 text-xs"><Trophy className="h-4 w-4 text-amber-300" /> More modes can be added without changing the data dashboard.</span>
      </div>
    </section>
  );
};

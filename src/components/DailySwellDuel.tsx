import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, CheckCircle2, Clock3, Copy, ExternalLink, Share2, Trophy, Waves, XCircle } from 'lucide-react';
import { GameBuoy, LeaderboardEntry } from '../types';

type Direction = 'higher' | 'lower';

interface DailyRound {
  round: number;
  left: GameBuoy & { slug: string };
  right: Omit<GameBuoy & { slug: string }, 'waveHeight'> & { waveHeight?: number };
}

interface Challenge {
  date: string;
  rounds: DailyRound[];
  createdAt: string;
  source: string;
}

const todayUtc = () => new Date().toISOString().slice(0, 10);

const countdown = () => {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const remaining = Math.max(0, tomorrow.getTime() - now.getTime());
  return `${String(Math.floor(remaining / 3_600_000)).padStart(2, '0')}:${String(Math.floor((remaining % 3_600_000) / 60_000)).padStart(2, '0')}:${String(Math.floor((remaining % 60_000) / 1_000)).padStart(2, '0')}`;
};

const observedAt = (value: string) => new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

const attemptKey = (date: string) => {
  const storageKey = `vawe-daily-attempt-${date}`;
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  const key = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID().replaceAll('-', '') : `${Date.now()}${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(storageKey, key);
  return key;
};

export const DailySwellDuel: React.FC = () => {
  const pathDate = window.location.pathname.match(/^\/game\/daily\/(\d{4}-\d{2}-\d{2})$/)?.[1] || todayUtc();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [guess, setGuess] = useState<Direction | null>(null);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [revealedRight, setRevealedRight] = useState<(GameBuoy & { slug: string }) | null>(null);
  const [remaining, setRemaining] = useState(countdown());
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [name, setName] = useState(() => localStorage.getItem('vawe-player-name') || '');
  const [submitState, setSubmitState] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/game/daily/${pathDate}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'The recorded challenge is unavailable.');
        if (!cancelled) setChallenge(data);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load this challenge.');
      }
    };
    load();
    const tick = window.setInterval(() => setRemaining(countdown()), 1_000);
    return () => { cancelled = true; window.clearInterval(tick); };
  }, [pathDate]);

  const complete = Boolean(challenge && answers.length === challenge.rounds.length);
  const activeRound = challenge?.rounds[roundIndex];
  const accuracy = useMemo(() => answers.length ? Math.round((answers.filter(Boolean).length / answers.length) * 100) : 0, [answers]);

  useEffect(() => {
    if (!complete) return;
    fetch(`/api/game/leaderboard?date=${pathDate}`)
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => setBoard(data.leaderboard || []))
      .catch(() => setBoard([]));
  }, [complete, pathDate]);

  const select = async (direction: Direction) => {
    if (!activeRound || guess) return;
    try {
      const response = await fetch(`/api/game/daily/${challenge?.date}/answer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerKey: attemptKey(pathDate), round: activeRound.round, guess: direction }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The guess could not be recorded.');
      setGuess(direction);
      setRevealedRight(data.right);
      setAnswers(current => [...current, data.correct]);
      setScore(data.score);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The guess could not be recorded.');
    }
  };

  const nextRound = () => {
    if (!challenge) return;
    setGuess(null);
    setRevealedRight(null);
    if (roundIndex < challenge.rounds.length - 1) setRoundIndex(current => current + 1);
  };

  const share = async () => {
    const url = window.location.href;
    const text = `I scored ${score}/${challenge?.rounds.length || 5} in today’s Vawe Swell Duel using recorded NOAA buoy observations. Can you beat me?`;
    try {
      if (navigator.share) await navigator.share({ title: 'Vawe Swell Duel', text, url });
      else await navigator.clipboard.writeText(`${text} ${url}`);
    } catch {
      // Dismissing a native share dialog is not an application error.
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!challenge || score < 1 || submitState) return;
    const callsign = name.trim() || 'Anonymous Navigator';
    localStorage.setItem('vawe-player-name', callsign);
    setSubmitState('Submitting…');
    try {
      const response = await fetch('/api/game/leaderboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: callsign, streak: score, accuracy, challengeDate: challenge.date, attemptKey: attemptKey(challenge.date), rankTitle: 'Daily Swell Duel' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Score submission failed.');
      setBoard(data.leaderboard || []);
      setSubmitState(data.duplicate ? 'Your recorded score is already on this leaderboard.' : 'Score recorded.');
    } catch (reason) {
      setSubmitState(reason instanceof Error ? reason.message : 'Score submission failed.');
    }
  };

  if (error) return <div className="mx-auto max-w-3xl rounded-2xl border border-amber-400/35 bg-amber-950/30 p-6 font-mono text-amber-100"><h2 className="font-black">Daily challenge unavailable</h2><p className="mt-2 text-sm">{error} Vawe does not create replacement questions without observed NOAA station data.</p></div>;
  if (!challenge || !activeRound) return <div className="flex min-h-80 items-center justify-center font-mono text-cyan-100/70"><Waves className="mr-3 h-5 w-5 animate-pulse" />Recording today’s NOAA buoy snapshot…</div>;

  const correct = guess ? answers[answers.length - 1] : null;
  return <section className="mx-auto max-w-5xl space-y-6 font-mono">
    <header className="overflow-hidden rounded-3xl border border-cyan-200/20 bg-[linear-gradient(115deg,rgba(6,49,73,.94),rgba(12,25,62,.94))] p-6 shadow-2xl sm:p-9">
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/30 bg-cyan-100/10 px-3 py-1 text-[10px] font-black tracking-[.16em] text-cyan-50"><Waves className="h-3.5 w-3.5" /> DAILY SWELL DUEL</span><span className="inline-flex items-center gap-2 text-xs text-cyan-50/65"><Clock3 className="h-3.5 w-3.5" /> Next challenge in {remaining}</span></div>
      <h1 className="mt-6 text-3xl font-black tracking-tight text-white sm:text-5xl">Five observed rounds. One shared daily snapshot.</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-cyan-50/70">Round {roundIndex + 1} of {challenge.rounds.length} · snapshot recorded {observedAt(challenge.createdAt)} · source: {challenge.source}</p>
    </header>

    {!complete ? <article className="rounded-3xl border border-cyan-100/15 bg-[#07243a]/90 p-6 shadow-2xl sm:p-9">
      <div className="flex items-center justify-between gap-4"><span className="text-xs font-bold tracking-[.14em] text-cyan-100/55">CURRENT HEIGHT</span><span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-200">Score {score}</span></div>
      <div className="mt-10 grid gap-5 md:grid-cols-2"><div className="rounded-2xl border border-cyan-100/15 bg-[#041b2c] p-5"><p className="text-xs text-cyan-100/50">LEFT BUOY</p><h2 className="mt-3 text-2xl font-black text-white">{activeRound.left.name}</h2><p className="mt-2 text-sm text-cyan-100/60">NOAA #{activeRound.left.id} · {activeRound.left.location}</p><p className="mt-7 text-4xl font-black text-cyan-100">{activeRound.left.waveHeight.toFixed(2)} m</p><p className="mt-2 text-xs text-cyan-100/50">Observed {observedAt(activeRound.left.timestamp)}</p><a className="mt-4 inline-flex items-center gap-1.5 text-xs text-cyan-200 underline" href={`/buoys/${activeRound.left.slug}`}>Inspect station <ExternalLink className="h-3 w-3" /></a></div>
        <div className="rounded-2xl border border-cyan-100/15 bg-[#041b2c] p-5"><p className="text-xs text-cyan-100/50">RIGHT BUOY</p><h2 className="mt-3 text-2xl font-black text-white">{activeRound.right.name}</h2><p className="mt-2 text-sm text-cyan-100/60">NOAA #{activeRound.right.id} · {activeRound.right.location}</p>{!guess ? <p className="mt-7 text-4xl font-black tracking-[.18em] text-cyan-100/50">??</p> : <p className="mt-7 text-4xl font-black text-cyan-100">{revealedRight?.waveHeight.toFixed(2)} m</p>}<p className="mt-2 text-xs text-cyan-100/50">Observed {observedAt(activeRound.right.timestamp)}</p><a className="mt-4 inline-flex items-center gap-1.5 text-xs text-cyan-200 underline" href={`/buoys/${activeRound.right.slug}`}>Inspect station <ExternalLink className="h-3 w-3" /></a></div></div>
      {!guess ? <div className="mt-7 grid gap-3 sm:grid-cols-2"><button onClick={() => select('higher')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-4 text-sm font-black text-[#042034] transition hover:bg-cyan-200"><ArrowUp className="h-5 w-5" /> RIGHT IS HIGHER</button><button onClick={() => select('lower')} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-100/25 bg-[#0b3952] px-5 py-4 text-sm font-black text-white transition hover:bg-[#114b69]"><ArrowDown className="h-5 w-5" /> RIGHT IS LOWER</button></div> : <div className={`mt-7 rounded-2xl border p-5 ${correct ? 'border-emerald-300/35 bg-emerald-950/35 text-emerald-100' : 'border-rose-300/35 bg-rose-950/35 text-rose-100'}`}><div className="flex items-start justify-between gap-4"><p className="text-sm">{correct ? <CheckCircle2 className="mr-2 inline h-5 w-5" /> : <XCircle className="mr-2 inline h-5 w-5" />}<strong>{correct ? 'Correct.' : 'Not this round.'}</strong> The right buoy measured {revealedRight?.waveHeight.toFixed(2)} m, so it was {correct ? guess : guess === 'higher' ? 'lower' : 'higher'} than {activeRound.left.name} at {activeRound.left.waveHeight.toFixed(2)} m.</p>{roundIndex < challenge.rounds.length - 1 && <button onClick={nextRound} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-xs font-black hover:bg-white/25">Next round <ArrowRight className="h-3.5 w-3.5" /></button>}</div></div>}
    </article> : <article className="rounded-3xl border border-amber-300/25 bg-[linear-gradient(120deg,rgba(105,68,15,.38),rgba(6,30,49,.92))] p-7 sm:p-10"><Trophy className="h-8 w-8 text-amber-300" /><h2 className="mt-4 text-4xl font-black text-white">{score} / {challenge.rounds.length}</h2><p className="mt-2 max-w-2xl text-sm text-amber-50/75">You answered {accuracy}% correctly from the shared {challenge.date} NOAA observation snapshot. Challenge a friend with the same URL.</p><div className="mt-6 flex flex-wrap gap-3"><button onClick={share} className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2 text-xs font-black text-[#332006]"><Share2 className="h-4 w-4" /> Share result</button><button onClick={() => navigator.clipboard.writeText(window.location.href)} className="inline-flex items-center gap-2 rounded-xl border border-amber-100/25 px-4 py-2 text-xs font-black text-amber-50"><Copy className="h-4 w-4" /> Copy challenge link</button></div></article>}

    {complete && <section className="rounded-3xl border border-cyan-100/15 bg-[#071f31] p-6 sm:p-8"><h2 className="text-xl font-black text-white">Daily leaderboard</h2><p className="mt-1 text-sm text-cyan-100/60">Only persisted submissions for this five-round challenge appear here. An empty list means no one has submitted a valid score yet.</p>{score > 0 && <form onSubmit={submit} className="mt-5 flex flex-col gap-3 sm:flex-row"><input value={name} onChange={event => setName(event.target.value)} maxLength={20} placeholder="Your callsign" className="rounded-xl border border-cyan-100/20 bg-[#041725] px-4 py-3 text-sm text-white outline-none focus:border-cyan-200"/><button disabled={Boolean(submitState)} className="rounded-xl bg-cyan-300 px-4 py-3 text-xs font-black text-[#042034] disabled:opacity-60">{submitState || 'Record daily score'}</button></form>}{board.length ? <ol className="mt-6 space-y-2">{board.map((entry, index) => <li key={entry.id} className="flex items-center justify-between rounded-xl border border-cyan-100/10 bg-[#092a40] px-4 py-3 text-sm"><span><strong className="mr-3 text-cyan-200">#{index + 1}</strong>{entry.name}</span><span>{entry.streak}/5</span></li>)}</ol> : <p className="mt-6 rounded-xl border border-dashed border-cyan-100/20 p-4 text-sm text-cyan-100/55">No verified score has been submitted for this challenge yet.</p>}</section>}
  </section>;
};

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { GameBuoy } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { GlobalHighScores } from './GlobalHighScores';
import { 
  Trophy, 
  Flame, 
  Share2, 
  RotateCcw, 
  ArrowUp, 
  ArrowDown, 
  ExternalLink, 
  Sparkles, 
  Volume2, 
  VolumeX, 
  CheckCircle2, 
  XCircle, 
  Compass, 
  Waves,
  Award,
  Zap,
  Radio
} from 'lucide-react';

interface BuoyDuelGameProps {
  onInspectBuoy?: (stationId: string) => void;
}

// Simple Web Audio sound synthesizer for tactile game feedback
class SoundFX {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }

  playCorrect() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';
      
      osc1.frequency.setValueAtTime(523.25, this.ctx.currentTime); // C5
      osc1.frequency.exponentialRampToValueAtTime(783.99, this.ctx.currentTime + 0.15); // G5
      
      osc2.frequency.setValueAtTime(659.25, this.ctx.currentTime); // E5
      osc2.frequency.exponentialRampToValueAtTime(1046.50, this.ctx.currentTime + 0.2); // C6

      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(this.ctx.currentTime + 0.35);
      osc2.stop(this.ctx.currentTime + 0.35);
    } catch {
      // AudioContext policy fallback
    }
  }

  playWrong() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(90, this.ctx.currentTime + 0.25);

      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    } catch {
      // AudioContext policy fallback
    }
  }

  playClick() {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch {
      // AudioContext policy fallback
    }
  }
}

const sfx = new SoundFX();

export const BuoyDuelGame: React.FC<BuoyDuelGameProps> = ({ onInspectBuoy }) => {
  const [buoys, setBuoys] = useState<GameBuoy[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Gameplay state
  const [leftBuoy, setLeftBuoy] = useState<GameBuoy | null>(null);
  const [rightBuoy, setRightBuoy] = useState<GameBuoy | null>(null);
  const [gameState, setGameState] = useState<'GUESSING' | 'REVEALED' | 'GAME_OVER'>('GUESSING');
  const [userGuess, setUserGuess] = useState<'HIGHER' | 'LOWER' | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  // Score stats
  const [streak, setStreak] = useState<number>(0);
  const [bestStreak, setBestStreak] = useState<number>(() => {
    return parseInt(localStorage.getItem('live_events_best_streak') || '0', 10);
  });
  const [totalGuesses, setTotalGuesses] = useState<number>(0);
  const [correctGuesses, setCorrectGuesses] = useState<number>(0);

  // Preferences
  const [unit, setUnit] = useState<'m' | 'ft'>('m');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [shareToast, setShareToast] = useState<string | null>(null);

  // Toggle sound
  const toggleSound = () => {
    sfx.enabled = !soundEnabled;
    setSoundEnabled(!soundEnabled);
  };

  // Fetch verified active buoys from backend
  const fetchBuoyPool = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ocean/game/buoys');
      if (!res.ok) throw new Error('Could not load live buoy pool');
      const data = await res.json();
      if (!data.buoys || data.buoys.length < 2) {
        throw new Error('Not enough active buoys reporting right now');
      }
      setBuoys(data.buoys);
      setupNextRound(data.buoys, null);
    } catch (err: any) {
      console.error('Game buoy fetch error:', err);
      setError(err.message || 'Failed to fetch live buoys from NOAA');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBuoyPool();
  }, []);

  // Pick two different buoys for a round
  const setupNextRound = (pool: GameBuoy[], carryLeftBuoy: GameBuoy | null) => {
    if (pool.length < 2) return;

    let left = carryLeftBuoy;
    if (!left) {
      const idx1 = Math.floor(Math.random() * pool.length);
      left = pool[idx1];
    }

    // Pick right buoy that is different and ideally doesn't have exact same wave height
    const candidates = pool.filter(b => b.id !== left!.id);
    // Prefer one with at least 0.1m difference to avoid ties if possible
    const distinct = candidates.filter(b => Math.abs(b.waveHeight - left!.waveHeight) >= 0.05);
    const poolToPick = distinct.length > 0 ? distinct : candidates;
    const right = poolToPick[Math.floor(Math.random() * poolToPick.length)];

    setLeftBuoy(left);
    setRightBuoy(right);
    setGameState('GUESSING');
    setUserGuess(null);
    setIsCorrect(null);
  };

  // Convert meters to display unit
  const formatHeight = (meters: number) => {
    if (unit === 'ft') {
      const feet = meters * 3.28084;
      return `${feet.toFixed(1)} ft`;
    }
    return `${meters.toFixed(2)} m`;
  };

  // Handle Player Guess: HIGHER or LOWER
  const handleGuess = (guess: 'HIGHER' | 'LOWER') => {
    if (gameState !== 'GUESSING' || !leftBuoy || !rightBuoy) return;
    sfx.playClick();

    setUserGuess(guess);
    const leftVal = leftBuoy.waveHeight;
    const rightVal = rightBuoy.waveHeight;

    // Check correctness:
    // If rightVal === leftVal, count as push / win for player
    let won = false;
    if (guess === 'HIGHER') {
      won = rightVal >= leftVal;
    } else {
      won = rightVal <= leftVal;
    }

    setIsCorrect(won);
    setTotalGuesses(prev => prev + 1);

    if (won) {
      sfx.playCorrect();
      const newStreak = streak + 1;
      setStreak(newStreak);
      setCorrectGuesses(prev => prev + 1);
      if (newStreak > bestStreak) {
        setBestStreak(newStreak);
        localStorage.setItem('live_events_best_streak', newStreak.toString());
      }
      setGameState('REVEALED');
    } else {
      sfx.playWrong();
      setGameState('GAME_OVER');
    }
  };

  // Advance to next round (keep right buoy as new anchor!)
  const handleNextRound = () => {
    sfx.playClick();
    if (gameState === 'REVEALED' && rightBuoy) {
      setupNextRound(buoys, rightBuoy);
    } else {
      // New game after game over
      setStreak(0);
      setupNextRound(buoys, null);
    }
  };

  // Rank determination based on streak
  const rank = useMemo(() => {
    if (streak >= 12) return { title: 'Mavericks Master', color: 'text-purple-400', badge: 'bg-purple-500/20 border-purple-500/40' };
    if (streak >= 8) return { title: 'Big Wave Rider', color: 'text-red-400', badge: 'bg-red-500/20 border-red-500/40' };
    if (streak >= 5) return { title: 'Offshore Navigator', color: 'text-amber-400', badge: 'bg-amber-500/20 border-amber-500/40' };
    if (streak >= 3) return { title: 'Coastline Scout', color: 'text-cyan-400', badge: 'bg-cyan-500/20 border-cyan-500/40' };
    return { title: 'Beachcomber', color: 'text-zinc-400', badge: 'bg-zinc-800 border-zinc-700' };
  }, [streak]);

  // Share score / Challenge friend
  const handleShare = async () => {
    sfx.playClick();
    const appUrl = window.location.origin + '/?duel=true&streak=' + (streak || bestStreak);
    const shareText = `🌊 I scored a streak of ${streak || bestStreak} on LIVE SWELL DUEL! Can you guess which ocean buoy has higher waves right now? Try it: ${appUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Swell Duel — Live Ocean Buoy Challenge',
          text: shareText,
          url: appUrl
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setShareToast('Challenge copied to clipboard! Share it with friends to get views!');
      setTimeout(() => setShareToast(null), 3500);
    } catch {
      setShareToast('Share URL: ' + appUrl);
      setTimeout(() => setShareToast(null), 4000);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center font-mono space-y-4">
        <div className="h-10 w-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-400 text-sm">Querying NOAA ocean buoys across Pacific and Atlantic...</p>
      </div>
    );
  }

  if (error || !leftBuoy || !rightBuoy) {
    return (
      <div className="py-16 max-w-xl mx-auto text-center font-mono space-y-4">
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs">
          <p className="font-bold mb-1">Ocean Telemetry Ingestion Notice</p>
          <p>{error || 'Could not load active ocean stations.'}</p>
        </div>
        <button
          onClick={fetchBuoyPool}
          className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs cursor-pointer"
        >
          Retry Buoy Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono text-left max-w-5xl mx-auto">
      {/* Toast Notification */}
      <AnimatePresence>
        {shareToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-emerald-950 border border-emerald-500 text-emerald-200 text-xs font-mono font-bold shadow-2xl flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{shareToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-900">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black tracking-wider text-white uppercase">
                SWELL DUEL
              </h2>
              <span className="px-1.5 py-0.5 rounded bg-amber-500 text-black font-extrabold text-[10px] tracking-wider uppercase">
                LIVE GAME
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Guess which real-world NOAA ocean buoy has higher waves right now!
            </p>
          </div>
        </div>

        {/* Controls / Score Header */}
        <div className="flex items-center gap-3 self-end sm:self-auto">
          {/* Unit Toggle */}
          <div className="flex items-center rounded-lg bg-zinc-900 border border-zinc-800 p-0.5 text-xs">
            <button
              onClick={() => setUnit('m')}
              className={`px-2 py-1 rounded font-bold cursor-pointer transition-colors ${
                unit === 'm' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Meters
            </button>
            <button
              onClick={() => setUnit('ft')}
              className={`px-2 py-1 rounded font-bold cursor-pointer transition-colors ${
                unit === 'ft' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Feet
            </button>
          </div>

          {/* Sound Toggle */}
          <button
            id="toggle-game-sound-btn"
            onClick={toggleSound}
            title={soundEnabled ? 'Mute sound FX' : 'Enable sound FX'}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          {/* Leaderboard Jump Button */}
          <button
            id="jump-leaderboard-btn"
            onClick={() => {
              const el = document.getElementById('global-high-scores-container');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-amber-500/30 text-amber-300 text-xs font-bold cursor-pointer transition-colors"
          >
            <Trophy className="h-3.5 w-3.5 text-yellow-400" />
            <span className="hidden sm:inline">Top 10</span>
          </button>

          {/* Share Button */}
          <button
            id="share-game-score-btn"
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold cursor-pointer transition-colors"
          >
            <Share2 className="h-3.5 w-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Share</span>
          </button>
        </div>
      </div>

      {/* Scoreboard Band */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-zinc-950/80 border border-zinc-850">
        <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/40">
          <span className="text-[10px] text-zinc-500 block uppercase tracking-wider">CURRENT STREAK</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Flame className={`h-4 w-4 ${streak > 0 ? 'text-amber-400 animate-pulse' : 'text-zinc-600'}`} />
            <span className="text-2xl font-black text-amber-300 font-mono">{streak}</span>
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/40">
          <span className="text-[10px] text-zinc-500 block uppercase tracking-wider">BEST STREAK</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Trophy className="h-4 w-4 text-yellow-400" />
            <span className="text-2xl font-black text-yellow-300 font-mono">{bestStreak}</span>
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/40">
          <span className="text-[10px] text-zinc-500 block uppercase tracking-wider">CURRENT RANK</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Award className="h-4 w-4 text-cyan-400" />
            <span className={`text-xs font-bold truncate ${rank.color}`}>{rank.title}</span>
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/40">
          <span className="text-[10px] text-zinc-500 block uppercase tracking-wider">ACCURACY</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Zap className="h-4 w-4 text-emerald-400" />
            <span className="text-xl font-bold text-white font-mono">
              {totalGuesses > 0 ? `${Math.round((correctGuesses / totalGuesses) * 100)}%` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* MAIN DUEL ARENA: TWO COMPETING BUOY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 relative">
        {/* VS Badge in the center */}
        <div className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 h-11 w-11 rounded-full bg-zinc-950 border-2 border-zinc-700 shadow-2xl items-center justify-center font-black text-xs text-amber-400">
          VS
        </div>

        {/* CARD 1: THE ANCHOR BUOY (KNOWN HEIGHT) */}
        <div className="p-6 sm:p-7 rounded-2xl bg-zinc-950/90 border border-zinc-800 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-600" />
          
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-500/30 uppercase tracking-wider">
                ANCHOR BUOY
              </span>
              <span className="text-[11px] text-zinc-500 font-mono">
                NOAA #{leftBuoy.id}
              </span>
            </div>

            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">
              {leftBuoy.name}
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
              {leftBuoy.location}
            </p>
          </div>

          {/* Core Wave Height Display */}
          <div className="my-6 py-4 px-5 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">
              LIVE WAVE HEIGHT
            </span>
            <div className="text-5xl sm:text-6xl font-black text-cyan-300 font-mono tracking-tighter">
              {formatHeight(leftBuoy.waveHeight)}
            </div>
            <p className="text-xs text-zinc-400 mt-2">
              Physical significant wave height measured by NOAA sensors
            </p>
          </div>

          {/* Telemetry metadata footer */}
          <div className="pt-3 border-t border-zinc-900 flex items-center justify-between text-[11px] text-zinc-500">
            <div className="flex items-center gap-3">
              {leftBuoy.dominantPeriod && (
                <span>Period: <strong className="text-zinc-300">{leftBuoy.dominantPeriod}s</strong></span>
              )}
              {leftBuoy.windSpeed !== null && leftBuoy.windSpeed !== undefined && (
                <span>Wind: <strong className="text-zinc-300">{leftBuoy.windSpeed} m/s</strong></span>
              )}
            </div>
            {onInspectBuoy && (
              <button
                onClick={() => onInspectBuoy(leftBuoy.id)}
                className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 flex items-center gap-1 cursor-pointer"
              >
                Inspect <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* CARD 2: THE CHALLENGER BUOY (GUESS HIGHER OR LOWER) */}
        <div className={`p-6 sm:p-7 rounded-2xl bg-zinc-950/90 border shadow-xl flex flex-col justify-between relative overflow-hidden transition-all duration-300 ${
          gameState === 'REVEALED'
            ? 'border-emerald-500/50 shadow-emerald-950/20'
            : gameState === 'GAME_OVER'
              ? 'border-red-500/50 shadow-red-950/20'
              : 'border-zinc-800'
        }`}>
          <div className={`absolute top-0 left-0 right-0 h-1 transition-colors ${
            gameState === 'REVEALED' 
              ? 'bg-emerald-500' 
              : gameState === 'GAME_OVER' 
                ? 'bg-red-500' 
                : 'bg-amber-500'
          }`} />

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                CHALLENGER BUOY
              </span>
              <span className="text-[11px] text-zinc-500 font-mono">
                NOAA #{rightBuoy.id}
              </span>
            </div>

            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">
              {rightBuoy.name}
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
              {rightBuoy.location}
            </p>
          </div>

          {/* Mystery Wave Box / Revealed Box */}
          <div className="my-6 py-4 px-5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 text-left">
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold block mb-1">
              {gameState === 'GUESSING' ? 'WILL WAVES BE HIGHER OR LOWER?' : 'REVEALED WAVE HEIGHT'}
            </span>

            {gameState === 'GUESSING' ? (
              <div className="py-2 flex items-center justify-between">
                <div className="text-4xl sm:text-5xl font-black text-amber-400 font-mono tracking-tighter flex items-center gap-2">
                  <span>?</span>
                  <span className="text-sm font-bold text-zinc-500 uppercase font-sans">
                    {unit === 'ft' ? 'ft' : 'm'}
                  </span>
                </div>
                <div className="text-right text-xs text-zinc-400">
                  <span>Target to beat:</span>
                  <div className="text-sm font-black text-cyan-300">{formatHeight(leftBuoy.waveHeight)}</div>
                </div>
              </div>
            ) : (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="py-1"
              >
                <div className={`text-5xl sm:text-6xl font-black font-mono tracking-tighter ${
                  rightBuoy.waveHeight >= leftBuoy.waveHeight ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {formatHeight(rightBuoy.waveHeight)}
                </div>
                <div className="mt-1 text-xs flex items-center gap-2">
                  {rightBuoy.waveHeight >= leftBuoy.waveHeight ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <ArrowUp className="h-3.5 w-3.5" />
                      +{formatHeight(rightBuoy.waveHeight - leftBuoy.waveHeight)} higher
                    </span>
                  ) : (
                    <span className="text-amber-400 font-bold flex items-center gap-1">
                      <ArrowDown className="h-3.5 w-3.5" />
                      -{formatHeight(leftBuoy.waveHeight - rightBuoy.waveHeight)} lower
                    </span>
                  )}
                  <span className="text-zinc-500">than {leftBuoy.name}</span>
                </div>
              </motion.div>
            )}
          </div>

          {/* Action Area: Higher/Lower Buttons OR Outcome & Next Button */}
          {gameState === 'GUESSING' ? (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                id="guess-higher-btn"
                onClick={() => handleGuess('HIGHER')}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-black text-sm tracking-wider uppercase shadow-lg shadow-emerald-950/50 cursor-pointer transition-all"
              >
                <ArrowUp className="h-4 w-4 stroke-[3]" />
                HIGHER
              </button>

              <button
                id="guess-lower-btn"
                onClick={() => handleGuess('LOWER')}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-black text-sm tracking-wider uppercase shadow-lg shadow-rose-950/50 cursor-pointer transition-all"
              >
                <ArrowDown className="h-4 w-4 stroke-[3]" />
                LOWER
              </button>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {/* Correct Banner */}
              {gameState === 'REVEALED' && (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>CORRECT! Streak: {streak}</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                    +{streak * 10} PTS
                  </span>
                </div>
              )}

              {/* Game Over Banner */}
              {gameState === 'GAME_OVER' && (
                <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold">
                      <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                      <span>BUST! Final Streak: {streak}</span>
                    </div>
                    {streak > 0 && (
                      <button
                        onClick={() => {
                          const el = document.getElementById('global-high-scores-container');
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="text-amber-400 hover:text-amber-300 font-bold underline underline-offset-2 text-[11px] cursor-pointer flex items-center gap-1"
                      >
                        <Trophy className="h-3 w-3" />
                        <span>Post on Leaderboard ↓</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    You guessed {userGuess}, but {rightBuoy.name} was {rightBuoy.waveHeight >= leftBuoy.waveHeight ? 'higher' : 'lower'}.
                  </p>
                </div>
              )}

              {/* Advance button */}
              <div className="flex items-center gap-2">
                <button
                  id="game-next-round-btn"
                  onClick={handleNextRound}
                  className="flex-1 py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs tracking-wider uppercase shadow-lg cursor-pointer transition-all flex items-center justify-center gap-2"
                >
                  {gameState === 'REVEALED' ? (
                    <>
                      <span>Next Duel</span>
                      <ArrowUp className="h-4 w-4 rotate-90" />
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4" />
                      <span>Play Again</span>
                    </>
                  )}
                </button>

                <button
                  id="game-over-share-btn"
                  onClick={handleShare}
                  title="Share your streak on social media"
                  className="py-3 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5"
                >
                  <Share2 className="h-4 w-4 text-cyan-400" />
                  <span className="hidden sm:inline">Share</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* VIRAL SHARE & CHALLENGE CARD: Drives Views & Engagement */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-zinc-950 to-blue-950/30 border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
            <Share2 className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wide">
              Challenge a Friend — Can they beat your streak?
            </h4>
            <p className="text-xs text-zinc-400">
              Share your score on X, WhatsApp, or Reddit. All data is verified live from NOAA satellites.
            </p>
          </div>
        </div>

        <button
          id="copy-challenge-link-btn"
          onClick={handleShare}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs uppercase tracking-wider shadow-lg cursor-pointer transition-all flex items-center justify-center gap-2 shrink-0"
        >
          <Sparkles className="h-4 w-4" />
          <span>Copy Challenge Link</span>
        </button>
      </div>

      {/* GLOBAL HIGH SCORES (TOP 10 PLAYER STREAKS) */}
      <GlobalHighScores
        currentStreak={streak}
        bestStreak={bestStreak}
        currentRankTitle={rank.title}
        accuracy={totalGuesses > 0 ? Math.round((correctGuesses / totalGuesses) * 100) : undefined}
      />

      {/* Live Ocean Pool Directory */}
      <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-850">
        <h3 className="text-xs uppercase tracking-wider text-zinc-400 font-bold mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
            Live Buoys in Today&apos;s Active Duel Pool ({buoys.length} reporting)
          </span>
          <span className="text-[11px] text-zinc-500 font-normal">Real NOAA Telemetry</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs">
          {buoys.map(b => (
            <div
              key={b.id}
              className="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-850 flex flex-col justify-between"
            >
              <div className="truncate text-zinc-300 font-bold text-[11px]">{b.name}</div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-cyan-400 font-bold">{formatHeight(b.waveHeight)}</span>
                <span className="text-[10px] text-zinc-500">#{b.id}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

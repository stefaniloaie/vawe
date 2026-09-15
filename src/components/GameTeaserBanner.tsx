import React from 'react';
import { Flame, ArrowRight, Sparkles, Trophy } from 'lucide-react';

interface GameTeaserBannerProps {
  onPlayGame: () => void;
  bestStreak?: number;
}

export const GameTeaserBanner: React.FC<GameTeaserBannerProps> = ({ onPlayGame, bestStreak = 0 }) => {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-950/55 via-[#171426] to-teal-950/45 border border-violet-300/25 p-4 sm:p-5 font-mono shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3.5">
        <div className="h-10 w-10 rounded-xl bg-violet-400/15 border border-violet-300/35 flex items-center justify-center text-violet-200 shrink-0">
          <Flame className="h-5 w-5 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black tracking-wider text-violet-200 uppercase">
              OCEAN GAMES
            </span>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-violet-300 text-[#18122b] uppercase">
              NEW
            </span>
            {bestStreak > 0 && (
              <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                <Trophy className="h-3 w-3 text-yellow-400" />
                Best Streak: <strong className="text-violet-200">{bestStreak}</strong>
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-zinc-300 font-sans mt-0.5">
            Play Swell Duel, Wave Band, or Buoy Locator using real NOAA observations and station information.
          </p>
        </div>
      </div>

      <button
        onClick={onPlayGame}
        className="w-full sm:w-auto px-4 py-2 rounded-xl bg-violet-300 hover:bg-violet-200 active:scale-[0.98] text-[#18122b] font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 shadow-lg shadow-violet-950/40"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span>Explore games</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

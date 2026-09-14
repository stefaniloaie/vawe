import React, { useState, useEffect, useCallback } from 'react';
import { LeaderboardEntry } from '../types';
import { Trophy, Flame, Medal, RefreshCw, Send, Sparkles, User, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GlobalHighScoresProps {
  currentStreak: number;
  bestStreak: number;
  currentRankTitle: string;
  accuracy?: number;
  onScoreSubmitted?: (entry: LeaderboardEntry) => void;
}

export const GlobalHighScores: React.FC<GlobalHighScoresProps> = ({
  currentStreak,
  bestStreak,
  currentRankTitle,
  accuracy,
  onScoreSubmitted
}) => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Player submission state
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('live_events_player_name') || '';
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch leaderboard
  const fetchLeaderboard = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/game/leaderboard');
      if (!res.ok) throw new Error('Failed to load global leaderboard');
      const data = await res.json();
      setLeaderboard(data.leaderboard || []);
    } catch (err: any) {
      console.error('Leaderboard fetch error:', err);
      setError(err.message || 'Unable to retrieve global high scores');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Format relative timestamp
  const formatTimeAgo = (isoString: string) => {
    try {
      const elapsed = Date.now() - new Date(isoString).getTime();
      const mins = Math.floor(elapsed / 60000);
      if (mins < 2) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } catch {
      return 'Recent';
    }
  };

  // Submit player score
  const handleSubmitScore = async (e: React.FormEvent) => {
    e.preventDefault();
    const streakToSubmit = Math.max(currentStreak, bestStreak);
    if (streakToSubmit <= 0) {
      setSubmitMessage({ type: 'error', text: 'Score at least 1 correct guess to enter global rankings!' });
      return;
    }

    const trimmed = playerName.trim() || 'Anonymous Navigator';
    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      localStorage.setItem('live_events_player_name', trimmed);

      const res = await fetch('/api/game/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          streak: streakToSubmit,
          rankTitle: currentRankTitle || 'Ocean Navigator',
          accuracy: accuracy
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit score');
      }

      const data = await res.json();
      setLeaderboard(data.leaderboard || []);
      setSubmittedId(data.entry?.id || null);
      
      const rankText = data.playerRank ? `Rank #${data.playerRank} in Top 10!` : 'Submitted successfully!';
      setSubmitMessage({ type: 'success', text: `Spot claimed: ${rankText}` });

      if (onScoreSubmitted && data.entry) {
        onScoreSubmitted(data.entry);
      }
    } catch (err: any) {
      setSubmitMessage({ type: 'error', text: err.message || 'Could not submit score' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const eligibleStreak = Math.max(currentStreak, bestStreak);
  const minLeaderboardStreak = leaderboard.length >= 10 ? leaderboard[leaderboard.length - 1].streak : 0;
  const isTop10Worthy = eligibleStreak >= minLeaderboardStreak && eligibleStreak > 0;

  return (
    <div id="global-high-scores-container" className="rounded-2xl bg-zinc-950/95 border border-zinc-800 shadow-2xl p-5 sm:p-7 font-mono text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-900">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black tracking-wider text-white uppercase">
                GLOBAL HIGH SCORES
              </h3>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold uppercase tracking-wider">
                TOP 10 STREAKS
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-sans mt-0.5">
              Verified player streaks against live NOAA marine buoy telemetry.
            </p>
          </div>
        </div>

        {/* Refresh & status */}
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <button
            id="refresh-leaderboard-btn"
            onClick={() => fetchLeaderboard(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold cursor-pointer transition-colors disabled:opacity-50"
            title="Refresh leaderboard"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-cyan-400 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Quick Player Status & Submit Strip */}
      <div className="my-5 p-4 rounded-xl bg-gradient-to-r from-zinc-900/80 via-zinc-900/40 to-amber-950/20 border border-zinc-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                Your Performance Status
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-4 text-xs">
              <span className="text-zinc-400">
                Streak: <strong className="text-amber-400 font-mono text-base font-black">{currentStreak}</strong>
              </span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400">
                Best: <strong className="text-yellow-400 font-mono text-base font-black">{bestStreak}</strong>
              </span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400">
                Rank: <strong className="text-cyan-300 font-semibold">{currentRankTitle}</strong>
              </span>
            </div>
          </div>

          {/* Inline Submit Form */}
          <form onSubmit={handleSubmitScore} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <input
                id="player-callsign-input"
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Your Callsign (e.g. WaveRider)"
                maxLength={20}
                className="w-full sm:w-48 pl-8 pr-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400 font-mono"
              />
            </div>

            <button
              id="submit-leaderboard-btn"
              type="submit"
              disabled={isSubmitting || eligibleStreak <= 0}
              className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                eligibleStreak > 0
                  ? isTop10Worthy
                    ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-950/40'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700'
                  : 'bg-zinc-900 text-zinc-600 border border-zinc-850 cursor-not-allowed'
              }`}
            >
              <Send className="h-3.5 w-3.5" />
              <span>{isSubmitting ? 'Posting...' : 'Claim Rank'}</span>
            </button>
          </form>
        </div>

        {/* Submit feedback notification */}
        <AnimatePresence>
          {submitMessage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`mt-3 pt-3 border-t border-zinc-800/80 flex items-center gap-2 text-xs ${
                submitMessage.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {submitMessage.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{submitMessage.text}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Top 10 Table */}
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center space-y-3">
          <div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-500 text-xs">Querying global buoy duel records...</p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs text-center">
          <p>{error}</p>
          <button
            onClick={() => fetchLeaderboard(true)}
            className="mt-2 px-3 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[11px]"
          >
            Retry
          </button>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="py-8 text-center text-zinc-500 text-xs">
          No global scores logged yet. Be the first to claim spot #1!
        </div>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((entry, idx) => {
            const rankNum = idx + 1;
            const isFirst = rankNum === 1;
            const isSecond = rankNum === 2;
            const isThird = rankNum === 3;
            const isUserEntry = entry.id === submittedId;

            return (
              <motion.div
                key={entry.id || idx}
                id={`high-score-row-${rankNum}`}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className={`flex items-center justify-between p-3 sm:p-3.5 rounded-xl border text-xs transition-all ${
                  isUserEntry
                    ? 'bg-amber-500/10 border-amber-500/50 shadow-md shadow-amber-500/10'
                    : isFirst
                      ? 'bg-gradient-to-r from-yellow-950/30 via-zinc-900/50 to-zinc-900/30 border-yellow-500/40'
                      : isSecond
                        ? 'bg-zinc-900/60 border-zinc-400/30'
                        : isThird
                          ? 'bg-zinc-900/50 border-amber-700/30'
                          : 'bg-zinc-900/30 border-zinc-850 hover:bg-zinc-900/50'
                }`}
              >
                {/* Left: Rank & Player Info */}
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  {/* Rank Badge */}
                  <div className="flex items-center justify-center w-7 sm:w-8 shrink-0">
                    {isFirst ? (
                      <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-yellow-500 text-black font-black text-xs shadow-md shadow-yellow-500/30">
                        1
                      </div>
                    ) : isSecond ? (
                      <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-zinc-300 text-black font-black text-xs shadow-md shadow-zinc-400/20">
                        2
                      </div>
                    ) : isThird ? (
                      <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-amber-700 text-white font-black text-xs shadow-md shadow-amber-700/20">
                        3
                      </div>
                    ) : (
                      <span className="font-mono text-zinc-500 font-bold text-xs">
                        #{rankNum}
                      </span>
                    )}
                  </div>

                  {/* Player Name & Title */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-black tracking-wide truncate ${
                        isUserEntry ? 'text-amber-300' : isFirst ? 'text-yellow-300' : 'text-white'
                      }`}>
                        {entry.name}
                      </span>
                      {isUserEntry && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-500 text-black font-black text-[9px] uppercase tracking-wider">
                          YOU
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                      <span className="text-zinc-500">{entry.rankTitle}</span>
                      {entry.accuracy && (
                        <>
                          <span className="text-zinc-700">·</span>
                          <span className="text-emerald-400/90">{entry.accuracy}% acc</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Streak & Time Ago */}
                <div className="flex items-center gap-4 sm:gap-6 shrink-0 pl-2">
                  <div className="flex items-center gap-1.5">
                    <Flame className={`h-4 w-4 ${isFirst ? 'text-yellow-400' : 'text-amber-400'}`} />
                    <span className="text-lg sm:text-xl font-black font-mono tracking-tight text-amber-300">
                      {entry.streak}
                    </span>
                    <span className="text-[10px] text-zinc-500 uppercase hidden sm:inline">
                      streak
                    </span>
                  </div>

                  <div className="text-[10px] text-zinc-500 w-16 text-right hidden sm:flex items-center justify-end gap-1">
                    <Clock className="h-3 w-3 text-zinc-600" />
                    <span>{formatTimeAgo(entry.timestamp)}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-5 pt-4 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between text-[11px] text-zinc-500 gap-2">
        <span className="flex items-center gap-1.5">
          <Medal className="h-3.5 w-3.5 text-yellow-500" />
          Streaks require uninterrupted correct predictions against real NOAA buoy updates.
        </span>
        <span className="text-zinc-600">Updated in real-time</span>
      </div>
    </div>
  );
};

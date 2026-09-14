import React from 'react';
import { CategoryId } from '../types';
import { CATEGORY_DEFINITIONS } from '../sources/SourceRegistry';
import { Waves, Plane, Ship, Activity, Wind, Car, Orbit, Gamepad2, Flame } from 'lucide-react';

interface CategoryNavProps {
  activeCategory: CategoryId;
  onSelectCategory: (cat: CategoryId) => void;
}

const CATEGORY_ICONS: Record<CategoryId, React.ReactNode> = {
  OCEAN: <Waves className="h-3.5 w-3.5" />,
  GAME: <Gamepad2 className="h-3.5 w-3.5 text-amber-400" />,
  AIR: <Plane className="h-3.5 w-3.5" />,
  SHIPS: <Ship className="h-3.5 w-3.5" />,
  EARTH: <Activity className="h-3.5 w-3.5" />,
  WEATHER: <Wind className="h-3.5 w-3.5" />,
  TRAFFIC: <Car className="h-3.5 w-3.5" />,
  SPACE: <Orbit className="h-3.5 w-3.5" />
};

export const CategoryNav: React.FC<CategoryNavProps> = ({
  activeCategory,
  onSelectCategory
}) => {
  return (
    <nav id="category-navigation-bar" className="w-full overflow-x-auto scrollbar-none py-2 border-b border-zinc-900/80">
      <div className="flex items-center gap-1 sm:gap-2 min-w-max">
        {CATEGORY_DEFINITIONS.map(cat => {
          const isActive = activeCategory === cat.id;
          const isGame = cat.id === 'GAME';
          return (
            <button
              key={cat.id}
              id={`cat-nav-${cat.id.toLowerCase()}`}
              onClick={() => onSelectCategory(cat.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium tracking-wider transition-all cursor-pointer select-none ${
                isActive
                  ? isGame
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm shadow-amber-500/10'
                    : 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                  : isGame
                    ? 'text-amber-400/90 hover:text-amber-300 hover:bg-amber-950/30 border border-amber-500/30'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
              }`}
            >
              <span className={isActive ? (isGame ? 'text-amber-400' : 'text-cyan-400') : 'text-zinc-500'}>
                {CATEGORY_ICONS[cat.id]}
              </span>
              <span>{cat.label}</span>
              {isGame ? (
                <span className="text-[9px] px-1.5 py-0.2 rounded font-black tracking-widest bg-amber-500 text-black uppercase">
                  PLAY
                </span>
              ) : (
                <>
                  {cat.statusBadge === 'LIVE' && (
                    <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-emerald-500/50'}`} />
                  )}
                  {cat.statusBadge === 'SOON' && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-900 text-zinc-600 border border-zinc-850">
                      SOON
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

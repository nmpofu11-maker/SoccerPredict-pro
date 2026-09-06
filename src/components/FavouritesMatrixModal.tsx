import React, { useState } from 'react';
import { PRIORITY_FAVOURITE_TEAMS } from '../constants/favourites';
import { MatchFixture } from '../types/soccer';
import { Star, X, Search, ShieldCheck } from 'lucide-react';

interface FavouritesMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  fixtures: MatchFixture[];
}

export const FavouritesMatrixModal: React.FC<FavouritesMatrixModalProps> = ({
  isOpen,
  onClose,
  fixtures,
}) => {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  // Check which teams from the 80 matrix are in the active fixture schedule
  const activeTeamsSet = new Set<string>();
  fixtures.forEach((f) => {
    activeTeamsSet.add(f.homeTeam.name.toLowerCase());
    activeTeamsSet.add(f.awayTeam.name.toLowerCase());
  });

  const filteredTeams = PRIORITY_FAVOURITE_TEAMS.filter((team) =>
    team.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <Star className="w-4 h-4 fill-amber-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white font-sans">
                The 80 Priority Favourite Teams Matrix
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Rule 8 Automated Protocol: Flags `is_favourite: true` & enforces ≥55% win floor
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            id="btn-close-fav-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-900/50 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search across all 80 priority favourite clubs..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
          <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
            Showing {filteredTeams.length} of {PRIORITY_FAVOURITE_TEAMS.length}
          </span>
        </div>

        {/* Teams Grid */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {filteredTeams.map((team, idx) => {
            const isActiveInFeed = activeTeamsSet.has(team.toLowerCase());
            return (
              <div
                key={team}
                className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                  isActiveInFeed
                    ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono text-slate-500 w-5">
                    #{idx + 1}
                  </span>
                  <span className="font-semibold truncate">{team}</span>
                </div>

                {isActiveInFeed ? (
                  <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-bold">
                    <ShieldCheck className="w-3 h-3" />
                    IN PLAY
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-slate-500">
                    Matrix
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span>Priority Matrix hardcoded directly in engine specification.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
          >
            Close Matrix
          </button>
        </div>
      </div>
    </div>
  );
};

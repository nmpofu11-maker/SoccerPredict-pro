import React, { useState, useMemo } from 'react';
import { TeamStats, HistoricalMatchResult } from '../types/soccer';
import { getTeamFormBadgesData, FormResultBadgeData } from '../utils/formCalculator';
import { HISTORICAL_MATCH_RESULTS } from '../data/historical_results';

interface FormBadgesWithFtScoreProps {
  team: TeamStats;
  side?: 'home' | 'away';
  align?: 'left' | 'right';
  historicalResults?: HistoricalMatchResult[];
  size?: 'sm' | 'md';
}

export const FormBadgesWithFtScore: React.FC<FormBadgesWithFtScoreProps> = ({
  team,
  side = 'home',
  align = 'left',
  historicalResults = HISTORICAL_MATCH_RESULTS,
  size = 'sm',
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const badges = useMemo(() => {
    if (!team) return [];
    return getTeamFormBadgesData(team, historicalResults);
  }, [team, historicalResults]);

  if (!team || !badges || badges.length === 0) return null;

  const teamIdentifier = team.id || team.shortName || (team.name ? team.name.replace(/\s+/g, '-').toLowerCase() : 'unknown');

  return (
    <div
      className={`relative inline-flex items-center gap-1 select-none ${
        align === 'right' ? 'justify-end' : 'justify-start'
      }`}
      id={`form-badges-${side}-${teamIdentifier}`}
    >
      {badges.map((badge, i) => {
        const isHovered = hoveredIdx === i;

        // Color coding
        let badgeBg = '';
        let badgeText = '';
        let badgeBorder = '';
        let ringColor = '';

        if (badge.result === 'W') {
          badgeBg = 'bg-emerald-500/20 hover:bg-emerald-500/30';
          badgeText = 'text-emerald-400';
          badgeBorder = 'border-emerald-500/40';
          ringColor = 'ring-emerald-400';
        } else if (badge.result === 'D') {
          badgeBg = 'bg-amber-500/20 hover:bg-amber-500/30';
          badgeText = 'text-amber-400';
          badgeBorder = 'border-amber-500/40';
          ringColor = 'ring-amber-400';
        } else {
          badgeBg = 'bg-rose-500/20 hover:bg-rose-500/30';
          badgeText = 'text-rose-400';
          badgeBorder = 'border-rose-500/40';
          ringColor = 'ring-rose-400';
        }

        const sizeClasses =
          size === 'md'
            ? 'w-5 h-5 text-[10px]'
            : 'w-4 h-4 text-[9px]';

        return (
          <div
            key={`form-badge-${team.name}-${i}`}
            className="relative"
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <button
              type="button"
              onClick={() => setHoveredIdx(isHovered ? null : i)}
              className={`rounded font-mono font-extrabold flex items-center justify-center border transition-all cursor-pointer ${sizeClasses} ${badgeBg} ${badgeText} ${badgeBorder} ${
                isHovered ? `ring-2 ${ringColor} scale-110 shadow-md z-20` : ''
              }`}
              title={badge.tooltipTitle}
              data-ft-score={badge.score}
              data-result={badge.result}
              aria-label={badge.tooltipTitle}
            >
              <span>{badge.result}</span>
            </button>

            {/* Interactive FT Score Floating Tooltip on Hover */}
            {isHovered && (
              <div
                className={`absolute bottom-full mb-1.5 z-50 pointer-events-none whitespace-nowrap animate-in fade-in zoom-in-95 duration-150 ${
                  align === 'right' || (side === 'away' && i >= 3)
                    ? 'right-0 origin-bottom-right'
                    : i <= 1
                    ? 'left-0 origin-bottom-left'
                    : 'left-1/2 -translate-x-1/2 origin-bottom'
                }`}
                role="tooltip"
              >
                <div className="bg-slate-950 border border-slate-700/90 rounded-lg p-2 shadow-2xl backdrop-blur-sm text-left">
                  {/* FT Score Header */}
                  <div className="flex items-center justify-between gap-2.5 pb-1 mb-1 border-b border-slate-800">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                      Full-Time Score
                    </span>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-black uppercase ${
                        badge.result === 'W'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : badge.result === 'D'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}
                    >
                      {badge.result === 'W' ? 'WIN (+3)' : badge.result === 'D' ? 'DRAW (+1)' : 'LOSS (0)'}
                    </span>
                  </div>

                  {/* Prominent FT Score Display */}
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-mono font-bold text-slate-400">FT:</span>
                    <span
                      className={`text-base font-black font-mono tracking-wider ${
                        badge.result === 'W'
                          ? 'text-emerald-400'
                          : badge.result === 'D'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {badge.score}
                    </span>
                  </div>

                  {/* Opponent & Match Context */}
                  {badge.opponent && (
                    <div className="text-[10px] text-slate-300 font-sans mt-0.5 truncate max-w-[170px]">
                      vs <span className="font-semibold text-white">{badge.opponent}</span>{' '}
                      <span className="text-slate-500 font-mono text-[9px]">
                        [{badge.venue === 'H' ? 'Home' : 'Away'}]
                      </span>
                    </div>
                  )}

                  {/* Chronological order indicator */}
                  <div className="text-[8.5px] font-mono text-slate-500 mt-1 flex items-center justify-between gap-2">
                    <span>{badge.label}</span>
                    {badge.isHistorical && (
                      <span className="text-sky-400">Verified DB</span>
                    )}
                  </div>
                </div>

                {/* Downward triangle arrow pointer */}
                <div
                  className={`w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-700/90 ${
                    align === 'right' || (side === 'away' && i >= 3)
                      ? 'ml-auto mr-1.5'
                      : i <= 1
                      ? 'ml-1.5'
                      : 'mx-auto'
                  }`}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

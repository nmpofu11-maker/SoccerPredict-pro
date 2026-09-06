import React, { useState } from 'react';
import { TeamStats, HistoricalMatchResult } from '../types/soccer';
import { HISTORICAL_MATCH_RESULTS } from '../data/historical_results';
import { calculateTeamForm, calculateMatchFormComparison, FormMatchItem } from '../utils/formCalculator';
import { Activity, ShieldCheck, Info } from 'lucide-react';

interface FormTrendDisplayProps {
  homeTeam: TeamStats;
  awayTeam: TeamStats;
  historicalResults?: HistoricalMatchResult[];
  matchId?: string;
}

export const FormTrendDisplay: React.FC<FormTrendDisplayProps> = ({
  homeTeam,
  awayTeam,
  historicalResults = HISTORICAL_MATCH_RESULTS,
  matchId = 'fixture',
}) => {
  const [activeTooltip, setActiveTooltip] = useState<{
    side: 'home' | 'away';
    item: FormMatchItem;
    teamName: string;
  } | null>(null);

  const homeForm = calculateTeamForm(homeTeam.name, homeTeam, historicalResults);
  const awayForm = calculateTeamForm(awayTeam.name, awayTeam, historicalResults);
  const comparison = calculateMatchFormComparison(homeForm, awayForm);

  const renderFormBadge = (
    item: FormMatchItem,
    side: 'home' | 'away',
    teamName: string
  ) => {
    let colorClasses = '';
    let resultLabel = '';

    if (item.result === 'W') {
      colorClasses =
        'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30 hover:border-emerald-400';
      resultLabel = 'Win (3 pts)';
    } else if (item.result === 'D') {
      colorClasses =
        'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30 hover:border-amber-400';
      resultLabel = 'Draw (1 pt)';
    } else {
      colorClasses =
        'bg-rose-500/20 text-rose-300 border-rose-500/50 hover:bg-rose-500/30 hover:border-rose-400';
      resultLabel = 'Loss (0 pts)';
    }

    const tooltipText = item.isFromHistoricalMatch && item.opponent && item.score
      ? `${item.result}: ${teamName} ${item.score} ${item.opponent} [${item.venue === 'H' ? 'Home' : 'Away'}] (${item.date || 'Historical'})`
      : `Match ${item.index + 1}: ${resultLabel}`;

    const isCurrentActive =
      activeTooltip?.side === side && activeTooltip.item.index === item.index;

    return (
      <div key={`${side}-form-${item.index}`} className="relative">
        <button
          type="button"
          onClick={() =>
            setActiveTooltip(
              isCurrentActive ? null : { side, item, teamName }
            )
          }
          onMouseEnter={() => setActiveTooltip({ side, item, teamName })}
          onMouseLeave={() => setActiveTooltip(null)}
          title={tooltipText}
          id={`form-badge-${side}-${matchId}-${item.index}`}
          className={`relative w-6 h-6 rounded flex items-center justify-center font-mono font-extrabold text-[11px] border transition-all duration-150 select-none cursor-pointer ${colorClasses} ${
            isCurrentActive ? 'ring-2 ring-sky-400 scale-110' : ''
          }`}
        >
          <span>{item.result}</span>

          {/* Indicator dot if verified from historical match results */}
          {item.isFromHistoricalMatch && (
            <span
              className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-sky-400 border border-slate-900 shadow-sm"
              title="Verified from historical results database"
            />
          )}
        </button>
      </div>
    );
  };

  return (
    <div
      className="my-2.5 p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg text-xs font-mono space-y-2"
      id={`form-trend-container-${matchId}`}
    >
      {/* Top Header: Metric Title, Direction indicator, and Momentum Comparison */}
      <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 border-b border-slate-800/80 pb-1.5">
        <div className="flex items-center gap-1.5 font-bold text-slate-300">
          <Activity className="w-3.5 h-3.5 text-sky-400" />
          <span>5-MATCH FORM TREND</span>
          {(homeForm.historicalMatchesCount > 0 || awayForm.historicalMatchesCount > 0) && (
            <span
              className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-sky-950/70 border border-sky-800/50 text-[9px] text-sky-300"
              title="Includes verified historical match results from database"
            >
              <ShieldCheck className="w-2.5 h-2.5 text-sky-400" />
              <span>VERIFIED DATA</span>
            </span>
          )}
        </div>

        {/* Momentum Advantage Badge */}
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded text-[9.5px] font-bold border ${
              comparison.advantage === 'home'
                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/50'
                : comparison.advantage === 'away'
                ? 'bg-rose-950/70 text-rose-300 border-rose-800/50'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {comparison.differentialLabel}
          </span>
          <span className="hidden xs:inline text-[9px] text-slate-400 font-sans">
            (Oldest → Recent)
          </span>
        </div>
      </div>

      {/* Main Grid: Home Team Form on Left, Away Team Form on Right */}
      <div className="grid grid-cols-2 gap-3 pt-0.5">
        {/* HOME TEAM FORM */}
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="font-bold text-slate-200 truncate text-[11px]">
              {homeTeam.shortName || homeTeam.name}
            </span>
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-slate-400">
                {homeForm.wins}W-{homeForm.draws}D-{homeForm.losses}L
              </span>
              <span className="text-emerald-400 font-bold" title="Points accumulated across last 5 matches">
                {homeForm.points} Form Pts
              </span>
            </div>
          </div>

          {/* Form Badges Row */}
          <div className="flex items-center gap-1.5">
            {homeForm.matches.map((item) =>
              renderFormBadge(item, 'home', homeTeam.name)
            )}
            <span className="ml-auto text-[9px] text-slate-400 font-bold hidden sm:inline">
              {homeForm.pointsPerGame} PPG
            </span>
          </div>

          {/* Progress efficiency bar */}
          <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                homeForm.pointsPercentage >= 65
                  ? 'bg-emerald-500'
                  : homeForm.pointsPercentage >= 40
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
              style={{ width: `${homeForm.pointsPercentage}%` }}
              title={`Form Efficiency: ${homeForm.pointsPercentage}% (${homeForm.points}/15 points)`}
            />
          </div>
        </div>

        {/* AWAY TEAM FORM */}
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-rose-400 font-bold" title="Points accumulated across last 5 matches">
                {awayForm.points} Form Pts
              </span>
              <span className="text-slate-400">
                {awayForm.wins}W-{awayForm.draws}D-{awayForm.losses}L
              </span>
            </div>
            <span className="font-bold text-slate-200 truncate text-[11px] text-right">
              {awayTeam.shortName || awayTeam.name}
            </span>
          </div>

          {/* Form Badges Row */}
          <div className="flex items-center justify-end gap-1.5">
            <span className="mr-auto text-[9px] text-slate-400 font-bold hidden sm:inline">
              {awayForm.pointsPerGame} PPG
            </span>
            {awayForm.matches.map((item) =>
              renderFormBadge(item, 'away', awayTeam.name)
            )}
          </div>

          {/* Progress efficiency bar */}
          <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden flex justify-end">
            <div
              className={`h-full transition-all duration-300 ${
                awayForm.pointsPercentage >= 65
                  ? 'bg-emerald-500'
                  : awayForm.pointsPercentage >= 40
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
              style={{ width: `${awayForm.pointsPercentage}%` }}
              title={`Form Efficiency: ${awayForm.pointsPercentage}% (${awayForm.points}/15 points)`}
            />
          </div>
        </div>
      </div>

      {/* Active Match Inspection Tooltip / Drawer if clicked or hovered */}
      {activeTooltip && (
        <div
          className="p-1.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-300 flex items-center justify-between gap-2 animate-fadeIn"
          id={`form-tooltip-${matchId}`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <Info className="w-3 h-3 text-sky-400 flex-shrink-0" />
            <span className="truncate">
              <strong>{activeTooltip.teamName}:</strong>{' '}
              {activeTooltip.item.isFromHistoricalMatch &&
              activeTooltip.item.opponent &&
              activeTooltip.item.score ? (
                <span>
                  Result: <strong className={activeTooltip.item.result === 'W' ? 'text-emerald-400' : activeTooltip.item.result === 'D' ? 'text-amber-400' : 'text-rose-400'}>
                    {activeTooltip.item.result === 'W' ? 'Win' : activeTooltip.item.result === 'D' ? 'Draw' : 'Loss'}
                  </strong>{' '}
                  ({activeTooltip.item.score} vs {activeTooltip.item.opponent} [{activeTooltip.item.venue === 'H' ? 'Home' : 'Away'}])
                  {activeTooltip.item.date && <span className="text-slate-500"> • {activeTooltip.item.date}</span>}
                </span>
              ) : (
                <span>
                  Match {activeTooltip.item.index + 1}:{' '}
                  <strong className={activeTooltip.item.result === 'W' ? 'text-emerald-400' : activeTooltip.item.result === 'D' ? 'text-amber-400' : 'text-rose-400'}>
                    {activeTooltip.item.result === 'W' ? 'Win (+3 pts)' : activeTooltip.item.result === 'D' ? 'Draw (+1 pt)' : 'Loss (0 pts)'}
                  </strong>{' '}
                  (Recorded League Sequence)
                </span>
              )}
            </span>
          </div>

          <span className="text-[9px] text-slate-500 flex-shrink-0">
            {activeTooltip.item.isFromHistoricalMatch ? 'Historical Record' : 'League Sequence'}
          </span>
        </div>
      )}
    </div>
  );
};

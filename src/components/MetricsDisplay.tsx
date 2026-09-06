import React from 'react';
import { TeamStats } from '../types/soccer';

interface MetricsDisplayProps {
  homeTeam: TeamStats;
  awayTeam: TeamStats;
}

export const MetricsDisplay: React.FC<MetricsDisplayProps> = ({
  homeTeam,
  awayTeam,
}) => {
  const homeShort = homeTeam.shortName || homeTeam.name;
  const awayShort = awayTeam.shortName || awayTeam.name;

  // Possession percentages
  const homePoss = homeTeam.avgPossession || 50;
  const awayPoss = awayTeam.avgPossession || 50;
  const totalPoss = homePoss + awayPoss || 100;
  const homePossWidth = Math.min(92, Math.max(8, Math.round((homePoss / totalPoss) * 100)));
  const awayPossWidth = 100 - homePossWidth;

  // Shots on Target averages
  const homeSot = homeTeam.avgShotsOnTarget || 0;
  const awaySot = awayTeam.avgShotsOnTarget || 0;
  const totalSot = homeSot + awaySot || 1;
  const homeSotWidth = Math.min(92, Math.max(8, Math.round((homeSot / totalSot) * 100)));
  const awaySotWidth = 100 - homeSotWidth;

  return (
    <div className="my-2.5 p-2.5 bg-slate-950/70 rounded-lg border border-slate-800 space-y-2.5">
      {/* Metric 1: Average Possession */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px] font-mono">
          {/* HOME TEAM ATTRIBUTION */}
          <div className="flex items-center gap-1.5 min-w-0" title={`${homeTeam.name} (Home): ${homePoss}% average possession`}>
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-emerald-400 font-bold tracking-tight truncate max-w-[80px] sm:max-w-[110px]">
              {homeShort}
            </span>
            <span className="text-slate-400 text-[9px] font-medium">(H)</span>
            <span className="text-white font-extrabold text-xs ml-0.5">
              {homePoss}%
            </span>
          </div>

          {/* CENTER LABEL */}
          <span className="text-slate-400 uppercase text-[9px] font-mono font-bold tracking-wider bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
            AVG POSSESSION
          </span>

          {/* AWAY TEAM ATTRIBUTION */}
          <div className="flex items-center justify-end gap-1.5 min-w-0" title={`${awayTeam.name} (Away): ${awayPoss}% average possession`}>
            <span className="text-white font-extrabold text-xs mr-0.5">
              {awayPoss}%
            </span>
            <span className="text-slate-400 text-[9px] font-medium">(A)</span>
            <span className="text-rose-400 font-bold tracking-tight truncate max-w-[80px] sm:max-w-[110px]">
              {awayShort}
            </span>
            <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
          </div>
        </div>

        {/* COMPARISON BAR (Emerald = Home, Rose = Away) */}
        <div className="h-2 w-full bg-slate-900 rounded-full flex overflow-hidden shadow-inner border border-slate-800/80">
          <div
            className="bg-emerald-500 h-full transition-all duration-300"
            style={{ width: `${homePossWidth}%` }}
            title={`${homeTeam.name} (Home): ${homePoss}% (${homePossWidth}% share)`}
          />
          <div
            className="bg-rose-500 h-full transition-all duration-300"
            style={{ width: `${awayPossWidth}%` }}
            title={`${awayTeam.name} (Away): ${awayPoss}% (${awayPossWidth}% share)`}
          />
        </div>
      </div>

      {/* Metric 2: Average Shots on Target (SOT) */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px] font-mono">
          {/* HOME TEAM ATTRIBUTION */}
          <div className="flex items-center gap-1.5 min-w-0" title={`${homeTeam.name} (Home): ${homeSot.toFixed(1)} shots on target per match`}>
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-emerald-400 font-bold tracking-tight truncate max-w-[80px] sm:max-w-[110px]">
              {homeShort}
            </span>
            <span className="text-slate-400 text-[9px] font-medium">(H)</span>
            <span className="text-white font-extrabold text-xs ml-0.5">
              {homeSot.toFixed(1)}
            </span>
          </div>

          {/* CENTER LABEL */}
          <span className="text-slate-400 uppercase text-[9px] font-mono font-bold tracking-wider bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
            SHOTS ON TARGET
          </span>

          {/* AWAY TEAM ATTRIBUTION */}
          <div className="flex items-center justify-end gap-1.5 min-w-0" title={`${awayTeam.name} (Away): ${awaySot.toFixed(1)} shots on target per match`}>
            <span className="text-white font-extrabold text-xs mr-0.5">
              {awaySot.toFixed(1)}
            </span>
            <span className="text-slate-400 text-[9px] font-medium">(A)</span>
            <span className="text-rose-400 font-bold tracking-tight truncate max-w-[80px] sm:max-w-[110px]">
              {awayShort}
            </span>
            <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
          </div>
        </div>

        {/* COMPARISON BAR (Emerald = Home, Rose = Away) */}
        <div className="h-2 w-full bg-slate-900 rounded-full flex overflow-hidden shadow-inner border border-slate-800/80">
          <div
            className="bg-emerald-500 h-full transition-all duration-300"
            style={{ width: `${homeSotWidth}%` }}
            title={`${homeTeam.name} (Home): ${homeSot.toFixed(1)} SOT (${homeSotWidth}% share)`}
          />
          <div
            className="bg-rose-500 h-full transition-all duration-300"
            style={{ width: `${awaySotWidth}%` }}
            title={`${awayTeam.name} (Away): ${awaySot.toFixed(1)} SOT (${awaySotWidth}% share)`}
          />
        </div>
      </div>
    </div>
  );
};

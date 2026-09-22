import React from 'react';
import { TeamStats, HistoricalMatchResult } from '../types/soccer';
import { calculateTeamVolatility } from '../utils/teamVolatility';
import { Flame, ShieldAlert, Activity, CheckCircle2 } from 'lucide-react';

interface VolatilityHeatmapOverlayProps {
  homeTeam: TeamStats;
  awayTeam: TeamStats;
  historicalResults?: HistoricalMatchResult[];
}

export const getCleanDisplayTeamName = (name?: string, shortName?: string): string => {
  if (!name) return 'Team';
  if (/^Tre Fiori/i.test(name) || /^SP Tre Fiori/i.test(name)) return 'Tre Fiori';
  if (/^Sol de America/i.test(name)) return 'Sol de America';
  if (/^Real SC/i.test(name) || /^Real Queluz/i.test(name)) return 'Real Queluz';
  if (/^Santani/i.test(name) || /Deportivo Santani/i.test(name)) return 'Santani';
  if (/^Cosmos/i.test(name)) return 'Cosmos';

  // Common prefixes in club names: CS, SV, SC, SK, SL, US, CA, AA, EC, CD, CF, FC, FCM, SPG, FK, NK, SP, etc.
  const prefixRegex = /^(FC|CS|SV|SC|SK|SL|US|CA|AA|EC|CD|CF|UD|AS|SS|SP|FSV|TSG|VfB|VfL|BSC|AC|FCM|SPG|FK|NK|GNK|HNK|PFC|KAA|KRC|RSC|Deportivo)\s+/i;
  const stripped = name.replace(prefixRegex, '').trim();
  const base = stripped || name;
  if (/^Rio Ave/i.test(base)) return 'Rio Ave';
  if (/^Sporting CP/i.test(base) || /^Sporting/i.test(base)) return 'Sporting';
  if (/^Maritimo/i.test(base)) return 'Maritimo';
  if (/^Real Madrid/i.test(base)) return 'Real Madrid';
  if (/^Aston Villa/i.test(base)) return 'Aston Villa';
  if (/^Stade Nyonnais/i.test(base)) return 'Stade Nyon';
  if (/^River Ebro/i.test(base)) return 'River Ebro';

  return base.split(' ')[0] || base;
};

export const VolatilityHeatmapOverlay: React.FC<VolatilityHeatmapOverlayProps> = ({
  homeTeam,
  awayTeam,
  historicalResults,
}) => {
  if (!homeTeam || !awayTeam) return null;

  const homeVol = calculateTeamVolatility(homeTeam, historicalResults);
  const awayVol = calculateTeamVolatility(awayTeam, historicalResults);

  const getHeatmapBg = (color: 'green' | 'yellow' | 'orange' | 'red') => {
    switch (color) {
      case 'green':
        return 'bg-emerald-500 shadow-emerald-500/20';
      case 'yellow':
        return 'bg-amber-500 shadow-amber-500/20';
      case 'orange':
        return 'bg-orange-500 shadow-orange-500/20';
      case 'red':
        return 'bg-rose-500 shadow-rose-500/20';
    }
  };

  const getBorderColor = (color: 'green' | 'yellow' | 'orange' | 'red') => {
    switch (color) {
      case 'green':
        return 'border-emerald-500/40 text-emerald-300';
      case 'yellow':
        return 'border-amber-500/40 text-amber-300';
      case 'orange':
        return 'border-orange-500/40 text-orange-300';
      case 'red':
        return 'border-rose-500/40 text-rose-300';
    }
  };

  return (
    <div className="flex items-center gap-2 text-[11px] font-mono py-1 px-2 bg-slate-950/60 rounded-lg border border-slate-800/80">
      <div className="flex items-center gap-1.5 text-slate-400">
        <Activity className="w-3.5 h-3.5 text-indigo-400" />
        <span className="uppercase text-[10px] tracking-wider font-semibold">Volatility Heatmap:</span>
      </div>

      {/* Home Team Volatility Pill */}
      <div className={`flex items-center gap-1 px-2 py-0.5 rounded border ${getBorderColor(homeVol.heatColor)} bg-slate-900/80`}>
        <span className={`w-2 h-2 rounded-full ${getHeatmapBg(homeVol.heatColor)}`} />
        <span className="truncate max-w-[85px] font-bold text-white">{getCleanDisplayTeamName(homeTeam.name, homeTeam.shortName)}</span>
        <span className="font-semibold">({homeVol.volatilityIndex}%)</span>
      </div>

      <span className="text-slate-600">vs</span>

      {/* Away Team Volatility Pill */}
      <div className={`flex items-center gap-1 px-2 py-0.5 rounded border ${getBorderColor(awayVol.heatColor)} bg-slate-900/80`}>
        <span className={`w-2 h-2 rounded-full ${getHeatmapBg(awayVol.heatColor)}`} />
        <span className="truncate max-w-[85px] font-bold text-white">{getCleanDisplayTeamName(awayTeam.name, awayTeam.shortName)}</span>
        <span className="font-semibold">({awayVol.volatilityIndex}%)</span>
      </div>
    </div>
  );
};

import React from 'react';
import { PredictionResult, ManualOverrideType } from '../types/soccer';
import { Sparkles, ShieldCheck, Zap, CheckCircle2, TrendingUp } from 'lucide-react';

interface ProbabilityBoardProps {
  prediction: PredictionResult;
  homeTeamName: string;
  awayTeamName: string;
}

export const ProbabilityBoard: React.FC<ProbabilityBoardProps> = ({
  prediction,
  homeTeamName,
  awayTeamName,
}) => {
  const { homeWinPct, drawPct, awayWinPct, predictedWinner, manualOverride, confidenceScore } = prediction;

  const isHomeWinner = predictedWinner === 'home';
  const isAwayWinner = predictedWinner === 'away';
  const isDraw = predictedWinner === 'draw';

  const safeHome = Number.isFinite(homeWinPct) ? homeWinPct : 38.0;
  const safeDraw = Number.isFinite(drawPct) ? drawPct : 30.0;
  const safeAway = Number.isFinite(awayWinPct) ? awayWinPct : 32.0;

  // Calculate implied decimal fair odds (100 / probability)
  const homeOdds = safeHome > 0 ? (100 / safeHome).toFixed(2) : '--';
  const drawOdds = safeDraw > 0 ? (100 / safeDraw).toFixed(2) : '--';
  const awayOdds = safeAway > 0 ? (100 / safeAway).toFixed(2) : '--';

  return (
    <div className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-3 my-2" id={`prob-board-${prediction.matchId}`}>
      {/* Top Header: 8-Rule Status & Confidence Pill */}
      <div className="flex items-center justify-between text-xs mb-2.5 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-1.5">
          {manualOverride !== 'none' ? (
            <span className="inline-flex items-center gap-1 text-purple-300 bg-purple-950/60 border border-purple-800/60 px-2 py-0.5 rounded text-[11px] font-mono font-semibold whitespace-nowrap">
              <Zap className="w-3 h-3 text-purple-400" />
              <span>MANUAL OVERRIDE APPLIED</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-slate-300 text-[11px] font-mono font-medium whitespace-nowrap">
              <Sparkles className="w-3 h-3 text-sky-400" />
              <span className="text-slate-200 font-semibold">9-Rule Consensus Engine</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-mono">
          <span className="text-slate-400">Confidence:</span>
          <span className={`px-2 py-0.5 rounded font-bold ${
            confidenceScore >= 75
              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
              : confidenceScore >= 55
              ? 'bg-sky-950/80 text-sky-300 border border-sky-700/60'
              : 'bg-slate-800 text-slate-300 border border-slate-700'
          }`}>
            {confidenceScore}%
          </span>
        </div>
      </div>

      {/* 3-Column Percentage & Decimal Odds Matrix */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        {/* HOME COLUMN */}
        <div
          className={`rounded-md flex flex-col items-center justify-between py-2 px-1.5 border transition-all duration-150 relative ${
            manualOverride === 'force_home'
              ? 'bg-purple-950/60 border-purple-500'
              : isHomeWinner
              ? 'bg-emerald-950/60 border-emerald-500 ring-1 ring-emerald-500/40'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
          id={`prob-home-${prediction.matchId}`}
        >
          {isHomeWinner && (
            <span className="absolute -top-2 bg-emerald-500 text-slate-950 text-[8.5px] font-mono font-extrabold uppercase px-1.5 py-0.2 rounded-full tracking-wider shadow-sm">
              PICK
            </span>
          )}
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
            1 • HOME
          </span>
          <div className="flex flex-col items-center my-0.5">
            <span className={`font-mono font-extrabold text-lg sm:text-xl tracking-tight ${
              manualOverride === 'force_home'
                ? 'text-purple-300'
                : isHomeWinner
                ? 'text-emerald-400'
                : 'text-slate-200'
            }`}>
              {manualOverride === 'force_home' ? 'FORCED' : `${safeHome.toFixed(0)}%`}
            </span>
            <span className="text-[10px] font-mono text-slate-400 font-medium" title="Statistical fair odds computed purely from model probability (100 / win%). Zero bookmaker odds are used in engine calculations.">
              Fair: <strong className="text-slate-200">{homeOdds}</strong>
            </span>
          </div>
          <span className="text-[10px] text-slate-400 truncate max-w-full px-1 text-center font-medium">
            {homeTeamName}
          </span>
        </div>

        {/* DRAW COLUMN */}
        <div
          className={`rounded-md flex flex-col items-center justify-between py-2 px-1.5 border transition-all duration-150 relative ${
            manualOverride !== 'none'
              ? 'bg-slate-900/30 border-slate-800 opacity-40'
              : isDraw
              ? 'bg-sky-950/60 border-sky-500 ring-1 ring-sky-500/40'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
          id={`prob-draw-${prediction.matchId}`}
        >
          {isDraw && manualOverride === 'none' && (
            <span className="absolute -top-2 bg-sky-400 text-slate-950 text-[8.5px] font-mono font-extrabold uppercase px-1.5 py-0.2 rounded-full tracking-wider shadow-sm">
              PICK
            </span>
          )}
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
            X • DRAW
          </span>
          <div className="flex flex-col items-center my-0.5">
            <span className={`font-mono font-extrabold text-lg sm:text-xl tracking-tight ${
              isDraw ? 'text-sky-300' : 'text-slate-200'
            }`}>
              {manualOverride !== 'none' ? '--' : `${safeDraw.toFixed(0)}%`}
            </span>
            <span className="text-[10px] font-mono text-slate-400 font-medium" title="Statistical fair odds computed purely from model probability (100 / draw%). Zero bookmaker odds are used in engine calculations.">
              Fair: <strong className="text-slate-200">{drawOdds}</strong>
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium">
            Level
          </span>
        </div>

        {/* AWAY COLUMN */}
        <div
          className={`rounded-md flex flex-col items-center justify-between py-2 px-1.5 border transition-all duration-150 relative ${
            manualOverride === 'force_away'
              ? 'bg-purple-950/60 border-purple-500'
              : isAwayWinner
              ? 'bg-rose-950/60 border-rose-500 ring-1 ring-rose-500/40'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
          id={`prob-away-${prediction.matchId}`}
        >
          {isAwayWinner && (
            <span className="absolute -top-2 bg-rose-500 text-slate-950 text-[8.5px] font-mono font-extrabold uppercase px-1.5 py-0.2 rounded-full tracking-wider shadow-sm">
              PICK
            </span>
          )}
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
            2 • AWAY
          </span>
          <div className="flex flex-col items-center my-0.5">
            <span className={`font-mono font-extrabold text-lg sm:text-xl tracking-tight ${
              manualOverride === 'force_away'
                ? 'text-purple-300'
                : isAwayWinner
                ? 'text-rose-400'
                : 'text-slate-200'
            }`}>
              {manualOverride === 'force_away' ? 'FORCED' : `${safeAway.toFixed(0)}%`}
            </span>
            <span className="text-[10px] font-mono text-slate-400 font-medium" title="Statistical fair odds computed purely from model probability (100 / win%). Zero bookmaker odds are used in engine calculations.">
              Fair: <strong className="text-slate-200">{awayOdds}</strong>
            </span>
          </div>
          <span className="text-[10px] text-slate-400 truncate max-w-full px-1 text-center font-medium">
            {awayTeamName}
          </span>
        </div>
      </div>

      {/* Visual Proportional Multi-Segment Gauge */}
      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2 flex shadow-inner">
        <div
          className="bg-emerald-500 h-full transition-all duration-300"
          style={{ width: `${Math.max(0, safeHome)}%` }}
          title={`Home Win: ${safeHome.toFixed(1)}%`}
        />
        <div
          className="bg-sky-500 h-full transition-all duration-300"
          style={{ width: `${Math.max(0, safeDraw)}%` }}
          title={`Draw: ${safeDraw.toFixed(1)}%`}
        />
        <div
          className="bg-rose-500 h-full transition-all duration-300"
          style={{ width: `${Math.max(0, safeAway)}%` }}
          title={`Away Win: ${safeAway.toFixed(1)}%`}
        />
      </div>
    </div>
  );
};

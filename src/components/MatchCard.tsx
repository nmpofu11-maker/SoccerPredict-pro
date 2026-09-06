import React, { useState } from 'react';
import { MatchFixture, PredictionResult, ManualOverrideType, HistoricalMatchResult } from '../types/soccer';
import { TeamBadge } from './TeamBadge';
import { MetricsDisplay } from './MetricsDisplay';
import { FormTrendDisplay } from './FormTrendDisplay';
import { ProbabilityBoard } from './ProbabilityBoard';
import { RulesAuditChips } from './RulesAuditChips';
import { isFavouriteTeam } from '../constants/favourites';
import { getLeagueMeta } from '../constants/leagues';
import { HISTORICAL_MATCH_RESULTS } from '../data/historical_results';
import { Clock, Trophy, Flame, ChevronDown, ChevronUp, Star, RotateCcw, ArrowRight, ExternalLink, CheckCircle2, ShieldAlert, Sparkles, Zap } from 'lucide-react';

interface MatchCardProps {
  fixture: MatchFixture;
  prediction: PredictionResult;
  onOverrideChange: (matchId: string, override: ManualOverrideType) => void;
  historicalResults?: HistoricalMatchResult[];
}

export const MatchCard: React.FC<MatchCardProps> = ({
  fixture,
  prediction,
  onOverrideChange,
  historicalResults = HISTORICAL_MATCH_RESULTS,
}) => {
  const [showMathDetails, setShowMathDetails] = useState(false);

  const homeIsFav = isFavouriteTeam(fixture.homeTeam.name);
  const awayIsFav = isFavouriteTeam(fixture.awayTeam.name);

  // Format kickoff time cleanly to local hours/minutes and date
  const kickoffDate = new Date(fixture.kickoffTime);
  const localTimeStr = kickoffDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const localDateStr = kickoffDate.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });

  const leagueMeta = getLeagueMeta(fixture.league);

  // Identify consensus recommendation pick details for instant at-a-glance clarity
  const isHomePick = prediction.predictedWinner === 'home';
  const isAwayPick = prediction.predictedWinner === 'away';
  const isDrawPick = prediction.predictedWinner === 'draw';

  const pickTeamName = isHomePick
    ? fixture.homeTeam.name
    : isAwayPick
    ? fixture.awayTeam.name
    : 'Match Draw';

  const pickProbability = isHomePick
    ? prediction.homeWinPct
    : isAwayPick
    ? prediction.awayWinPct
    : prediction.drawPct;

  const pickFairOdds = pickProbability > 0 ? (100 / pickProbability).toFixed(2) : '--';

  return (
    <div
      className={`relative bg-[#0f172a] border rounded-xl p-3.5 sm:p-4 shadow-lg flex flex-col transition-all duration-200 ${
        prediction.manualOverride !== 'none'
          ? 'border-purple-500/60 ring-1 ring-purple-500/20'
          : prediction.isFavouriteMatch
          ? 'border-amber-500/40 ring-1 ring-amber-500/20 hover:border-amber-500/60'
          : 'border-slate-800 hover:border-slate-700'
      }`}
      id={`match-card-${fixture.id}`}
    >
      {/* 1. TOP METADATA ROW: League & Country on left, Kickoff Time on right */}
      <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-800/80 text-xs">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="text-[10px] font-mono text-sky-300 bg-sky-950/60 px-2 py-0.5 rounded uppercase border border-sky-800/40 truncate flex items-center gap-1">
            <span>{leagueMeta.flagEmoji}</span>
            <span className="font-semibold">{fixture.league}</span>
          </span>

          {fixture.round && (
            <span className="hidden sm:inline-block text-slate-400 text-[10px] font-mono">
              {fixture.round}
            </span>
          )}

          {fixture.isHighStakes && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/40 text-[9.5px] font-mono uppercase font-bold">
              <Flame className="w-3 h-3 text-rose-400" />
              HIGH STAKES
            </span>
          )}

          {prediction.isVolatilityCompressed && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 text-[9.5px] font-mono uppercase font-semibold">
              <ShieldAlert className="w-3 h-3 text-cyan-400" />
              VOLATILITY CAP
            </span>
          )}
        </div>

        {/* Kickoff Time label */}
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300 flex-shrink-0 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
          <Clock className="w-3 h-3 text-sky-400" />
          <span className="text-slate-400 hidden xs:inline">{localDateStr}</span>
          <span className="text-white font-bold">{localTimeStr}</span>
        </div>
      </div>

      {/* 2. AT-A-GLANCE CONSENSUS RECOMMENDATION BANNER (Instant Verdict) */}
      <div
        className={`flex items-center justify-between p-2 sm:px-3 rounded-lg border mb-3 transition-colors ${
          prediction.manualOverride !== 'none'
            ? 'bg-purple-950/40 border-purple-500/40 text-purple-200'
            : isHomePick
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
            : isAwayPick
            ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
            : 'bg-sky-950/40 border-sky-500/40 text-sky-200'
        }`}
        id={`verdict-banner-${fixture.id}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-shrink-0">
            {prediction.manualOverride !== 'none' ? (
              <Zap className="w-4 h-4 text-purple-400" />
            ) : (
              <CheckCircle2 className={`w-4 h-4 ${isHomePick ? 'text-emerald-400' : isAwayPick ? 'text-rose-400' : 'text-sky-400'}`} />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
              {prediction.manualOverride !== 'none' ? 'MANUAL FORCED PICK' : 'CONSENSUS RECOMMENDATION'}
            </div>
            <div className="font-sans font-extrabold text-xs sm:text-sm truncate text-white tracking-tight">
              {prediction.manualOverride === 'force_home'
                ? `${fixture.homeTeam.name} To Win (Forced)`
                : prediction.manualOverride === 'force_away'
                ? `${fixture.awayTeam.name} To Win (Forced)`
                : isDrawPick
                ? 'Predicted Outcome: Draw'
                : `${pickTeamName} To Win`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 font-mono text-right pl-2">
          <div>
            <div className="text-base sm:text-lg font-extrabold text-white leading-none">
              {pickProbability.toFixed(0)}%
            </div>
            <div className="text-[9.5px] text-slate-400 mt-0.5">
              Odds: <span className="text-white font-bold">{pickFairOdds}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. COMPETITOR ROW (High-Contrast Logos, Names, Rank, and Points) */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3 py-1 mb-1">
        {/* HOME TEAM */}
        <div className="flex items-center gap-2.5 min-w-0">
          <TeamBadge
            name={fixture.homeTeam.name}
            shortName={fixture.homeTeam.shortName}
            badgeColor={fixture.homeTeam.badgeColor}
            size="md"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-sm sm:text-base text-slate-100 tracking-tight leading-tight truncate">
                {fixture.homeTeam.name}
              </span>
              {homeIsFav && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-400/15 border border-amber-400/40 text-amber-300 text-[9.5px] font-mono whitespace-nowrap"
                  title="Priority 80 Favourite Team (Rule 8 active)"
                >
                  <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                  <span>FAV</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
              <span>Rank #{fixture.homeTeam.leagueRank}</span>
              <span>•</span>
              <span className="text-slate-300 font-semibold" title="Total season points in league table">
                {fixture.homeTeam.points} Table Pts
              </span>
            </div>
          </div>
        </div>

        {/* VS SEPARATOR / SOFASCORE VS H2H LINK */}
        <div className="flex flex-col items-center justify-center px-1">
          <a
            id={`vs-sofascore-link-${fixture.id}`}
            href={`https://www.google.com/search?q=${encodeURIComponent(`${fixture.homeTeam.name} vs ${fixture.awayTeam.name} sofascore`)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`Open ${fixture.homeTeam.name} vs ${fixture.awayTeam.name} on SofaScore in a new tab`}
            className="group/vs flex flex-col items-center justify-center px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-sky-500/60 transition-all duration-150 text-center cursor-pointer active:scale-95"
          >
            <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-slate-300 group-hover/vs:text-sky-300 transition-colors">
              <span>VS</span>
              <ExternalLink className="w-2.5 h-2.5 text-slate-500 group-hover/vs:text-sky-400 transition-colors" />
            </div>
            <span className="text-[8px] font-mono text-slate-400 group-hover/vs:text-sky-400/90 tracking-tight leading-none mt-0.5 transition-colors">
              sofascore
            </span>
          </a>
        </div>

        {/* AWAY TEAM */}
        <div className="flex items-center justify-end gap-2.5 min-w-0 text-right">
          <div className="min-w-0">
            <div className="flex items-center justify-end gap-1.5 flex-wrap">
              {awayIsFav && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-400/15 border border-amber-400/40 text-amber-300 text-[9.5px] font-mono whitespace-nowrap"
                  title="Priority 80 Favourite Team (Rule 8 active)"
                >
                  <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                  <span>FAV</span>
                </span>
              )}
              <span className="font-bold text-sm sm:text-base text-slate-100 tracking-tight leading-tight truncate">
                {fixture.awayTeam.name}
              </span>
            </div>
            <div className="flex items-center justify-end gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
              <span className="text-slate-300 font-semibold" title="Total season points in league table">
                {fixture.awayTeam.points} Table Pts
              </span>
              <span>•</span>
              <span>Rank #{fixture.awayTeam.leagueRank}</span>
            </div>
          </div>
          <TeamBadge
            name={fixture.awayTeam.name}
            shortName={fixture.awayTeam.shortName}
            badgeColor={fixture.awayTeam.badgeColor}
            size="md"
          />
        </div>
      </div>

      {/* 4. DUAL METRICS COMPARISON (Ball possession & SOT averages) */}
      <MetricsDisplay homeTeam={fixture.homeTeam} awayTeam={fixture.awayTeam} />

      {/* 5. 5-MATCH FORM TREND METRIC VISUAL */}
      <FormTrendDisplay
        homeTeam={fixture.homeTeam}
        awayTeam={fixture.awayTeam}
        historicalResults={historicalResults}
        matchId={fixture.id}
      />

      {/* 6. 3-COLUMN PROBABILITY MATRIX & IMPLIED DECIMAL ODDS */}
      <ProbabilityBoard
        prediction={prediction}
        homeTeamName={fixture.homeTeam.name}
        awayTeamName={fixture.awayTeam.name}
      />

      {/* 7. APPLIED MODIFIERS AUDIT CHIPS */}
      <RulesAuditChips rules={prediction.appliedRules} matchId={fixture.id} />

      {/* 8. SEGMENTED MANUAL ADJUSTMENT CONTROL */}
      <div className="mt-2.5 pt-2.5 border-t border-slate-800 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
          {/* FORCE HOME */}
          <button
            type="button"
            onClick={() => onOverrideChange(fixture.id, 'force_home')}
            className={`flex-1 py-1.5 px-2 text-[10px] font-bold font-mono rounded transition-colors whitespace-nowrap ${
              prediction.manualOverride === 'force_home'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-300 hover:text-emerald-400 hover:bg-slate-800'
            }`}
            id={`btn-force-home-${fixture.id}`}
            title="Force Home selection (Bypasses automated math to 75% Home Win floor)"
          >
            {prediction.manualOverride === 'force_home' ? '✓ FORCED 1' : 'FORCE 1'}
          </button>

          {/* AUTO / RESET (MIDDLE OPTION) */}
          <button
            type="button"
            onClick={() => onOverrideChange(fixture.id, 'none')}
            disabled={prediction.manualOverride === 'none'}
            className={`flex-1 py-1.5 px-2 text-[10px] font-bold font-mono rounded transition-colors whitespace-nowrap ${
              prediction.manualOverride === 'none'
                ? 'bg-slate-800 text-slate-300 cursor-default'
                : 'bg-purple-900/60 text-purple-200 hover:bg-purple-800 hover:text-white cursor-pointer'
            }`}
            id={`btn-reset-${fixture.id}`}
            title={prediction.manualOverride === 'none' ? 'Automated 9-Rule calculation active' : 'Reset back to automated 9-rule calculation'}
          >
            {prediction.manualOverride === 'none' ? 'AUTO ENGINE' : '↺ RESET AUTO'}
          </button>

          {/* FORCE AWAY */}
          <button
            type="button"
            onClick={() => onOverrideChange(fixture.id, 'force_away')}
            className={`flex-1 py-1.5 px-2 text-[10px] font-bold font-mono rounded transition-colors whitespace-nowrap ${
              prediction.manualOverride === 'force_away'
                ? 'bg-rose-600 text-white'
                : 'text-slate-300 hover:text-rose-400 hover:bg-slate-800'
            }`}
            id={`btn-force-away-${fixture.id}`}
            title="Force Away selection (Bypasses automated math to 75% Away Win floor)"
          >
            {prediction.manualOverride === 'force_away' ? '✓ FORCED 2' : 'FORCE 2'}
          </button>
        </div>

        {/* Calculation Details Accordion Trigger */}
        <div className="flex items-center justify-between pt-0.5 text-[10px] font-mono text-slate-400">
          <span className="text-[9.5px]">
            {prediction.manualOverride !== 'none' ? '[OVERRIDE ACTIVE]' : '[CALCULATED VIA 8 RULES]'}
          </span>
          <button
            type="button"
            onClick={() => setShowMathDetails(!showMathDetails)}
            className="hover:text-sky-300 flex items-center gap-1 transition-colors py-0.5 cursor-pointer font-medium"
            id={`btn-toggle-math-${fixture.id}`}
          >
            <span>{showMathDetails ? 'Hide Point Math' : 'Audit Point Math'}</span>
            {showMathDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Expanded Math Details */}
      {showMathDetails && (
        <div className="mt-2.5 p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono space-y-2 text-slate-300">
          <div className="font-bold text-sky-400 flex items-center justify-between pb-1 border-b border-slate-800">
            <span>8-RULE ACCUMULATED SCORE MATRIX</span>
            <span className="text-[10px] text-slate-500">Pure Arithmetic</span>
          </div>

          <div className="grid grid-cols-3 gap-2 py-1 text-center">
            <div className="bg-slate-900/90 p-2 rounded border border-slate-800">
              <div className="text-[10px] text-slate-400 font-bold uppercase">HOME ACCUMULATOR</div>
              <div className="text-base font-extrabold text-emerald-400">
                {prediction.finalPoints.home} pts
              </div>
              <div className="text-[9px] text-slate-500">Base: {prediction.rawPoints.home}</div>
            </div>
            <div className="bg-slate-900/90 p-2 rounded border border-slate-800">
              <div className="text-[10px] text-slate-400 font-bold uppercase">DRAW ACCUMULATOR</div>
              <div className="text-base font-extrabold text-slate-300">
                {prediction.finalPoints.draw} pts
              </div>
              <div className="text-[9px] text-slate-500">Base: {prediction.rawPoints.draw}</div>
            </div>
            <div className="bg-slate-900/90 p-2 rounded border border-slate-800">
              <div className="text-[10px] text-slate-400 font-bold uppercase">AWAY ACCUMULATOR</div>
              <div className="text-base font-extrabold text-rose-400">
                {prediction.finalPoints.away} pts
              </div>
              <div className="text-[9px] text-slate-500">Base: {prediction.rawPoints.away}</div>
            </div>
          </div>

          {/* Detailed rule notes */}
          <div className="space-y-1 pt-1 text-[11px]">
            {prediction.appliedRules.map((rule, i) => (
              <div key={i} className="flex items-start gap-2 text-slate-400">
                <ArrowRight className="w-3 h-3 text-sky-400 mt-0.5 flex-shrink-0" />
                <span>
                  <strong className="text-slate-200">{rule.ruleName}:</strong> {rule.impact} —{' '}
                  <span className="text-slate-400">{rule.description}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

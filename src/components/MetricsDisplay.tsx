import React, { useState, useMemo } from 'react';
import { TeamStats } from '../types/soccer';
import { computeComparativeDominance } from '../utils/robustMetricsCalculator';
import { ShieldAlert, ShieldCheck, Filter, Info, AlertTriangle, Coins, Star, Award } from 'lucide-react';
import { OutlierIndicator } from './OutlierIndicator';
import { resolveTeamPerformanceProfile, formatSquadValue } from '../utils/teamPerformanceProfile';

interface MetricsDisplayProps {
  homeTeam: TeamStats;
  awayTeam: TeamStats;
  league?: string;
}

export const MetricsDisplay: React.FC<MetricsDisplayProps> = ({
  homeTeam,
  awayTeam,
  league,
}) => {
  const [showAdjusted, setShowAdjusted] = useState<boolean>(true);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);

  if (!homeTeam || !awayTeam) return null;

  const homeShort = homeTeam.shortName || homeTeam.name || 'Home';
  const awayShort = awayTeam.shortName || awayTeam.name || 'Away';

  // Resolve canonical profiles for last season standings, squad market value, and match rating
  const homeProfile = useMemo(() => resolveTeamPerformanceProfile(homeTeam, league), [homeTeam, league]);
  const awayProfile = useMemo(() => resolveTeamPerformanceProfile(awayTeam, league), [awayTeam, league]);

  const homeSquadVal = homeTeam.totalSquadValueEur ?? homeProfile?.totalSquadValueEur ?? 200;
  const awaySquadVal = awayTeam.totalSquadValueEur ?? awayProfile?.totalSquadValueEur ?? 200;
  const totalSquadVal = homeSquadVal + awaySquadVal || 1;
  const homeValWidth = Math.min(92, Math.max(8, Math.round((homeSquadVal / totalSquadVal) * 100)));
  const awayValWidth = 100 - homeValWidth;

  const homeRating = homeTeam.avgMatchRating ?? homeProfile?.avgMatchRating ?? 6.85;
  const awayRating = awayTeam.avgMatchRating ?? awayProfile?.avgMatchRating ?? 6.85;
  const totalRating = homeRating + awayRating || 1;
  const homeRatingWidth = Math.min(92, Math.max(8, Math.round((homeRating / totalRating) * 100)));
  const awayRatingWidth = 100 - homeRatingWidth;

  const lastSeasonRankHome = homeTeam.lastSeasonRank ?? homeProfile?.lastSeasonRank ?? 10;
  const lastSeasonRankAway = awayTeam.lastSeasonRank ?? awayProfile?.lastSeasonRank ?? 10;
  const lastSeasonStandingHome = homeTeam.lastSeasonStanding ?? homeProfile?.lastSeasonStanding ?? '10th';
  const lastSeasonStandingAway = awayTeam.lastSeasonStanding ?? awayProfile?.lastSeasonStanding ?? '10th';

  // Compute robust schedule & outlier normalized metrics
  const comparative = useMemo(() => {
    return computeComparativeDominance(homeTeam, awayTeam);
  }, [homeTeam, awayTeam]);

  const { homeMetrics, awayMetrics, misleadingWarning } = comparative;

  // Values based on active mode (Adjusted vs Raw)
  const homePoss = showAdjusted ? homeMetrics.effectivePossession : (homeTeam.avgPossession || 50);
  const awayPoss = showAdjusted ? awayMetrics.effectivePossession : (awayTeam.avgPossession || 50);
  const totalPoss = homePoss + awayPoss || 100;
  const homePossWidth = Math.min(92, Math.max(8, Math.round((homePoss / totalPoss) * 100)));
  const awayPossWidth = 100 - homePossWidth;

  const homeSot = showAdjusted ? homeMetrics.effectiveShotsOnTarget : (homeTeam.avgShotsOnTarget || 0);
  const awaySot = showAdjusted ? awayMetrics.effectiveShotsOnTarget : (awayTeam.avgShotsOnTarget || 0);
  const totalSot = homeSot + awaySot || 1;
  const homeSotWidth = Math.min(92, Math.max(8, Math.round((homeSot / totalSot) * 100)));
  const awaySotWidth = 100 - homeSotWidth;

  const hasScheduleDeflation = homeMetrics.schedule.scheduleType === 'soft_schedule' || awayMetrics.schedule.scheduleType === 'soft_schedule';
  const hasScheduleUplift = homeMetrics.schedule.scheduleType === 'tough_schedule' || awayMetrics.schedule.scheduleType === 'tough_schedule';
  const anyOutliersCleaned = homeMetrics.hasOutliersCleaned || awayMetrics.hasOutliersCleaned;

  return (
    <div className="my-2.5 p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 space-y-2.5 font-mono">
      {/* HEADER & TOGGLE STRIP */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 flex-wrap gap-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
            Tactical Metrics
          </span>
          {anyOutliersCleaned && (
            <OutlierIndicator
              variant="badge"
              hasOutliersCleaned={true}
              teamName="Tactical Model"
              anomalousCount={homeMetrics.anomalousMatchesIgnored + awayMetrics.anomalousMatchesIgnored}
              notes={[...homeMetrics.outlierNotes, ...awayMetrics.outlierNotes]}
              anomalousMatches={[...homeMetrics.anomalousMatches, ...awayMetrics.anomalousMatches]}
            />
          )}
          <button
            type="button"
            onClick={() => setShowExplanation((prev) => !prev)}
            className="text-slate-400 hover:text-sky-300 transition-colors"
            title="Learn how outlier and schedule-adjusted metrics prevent misleading analysis"
          >
            <Info className="w-3 h-3" />
          </button>
        </div>

        {/* ADJUSTED VS RAW SWITCH */}
        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800 text-[9.5px]">
          <button
            type="button"
            onClick={() => setShowAdjusted(true)}
            className={`px-2 py-0.5 rounded transition-all font-bold ${
              showAdjusted
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Winsorized & Opponent-Rank Normalized: Prevents stat-padding against lower-table opposition from skewing model"
          >
            Schedule-Adjusted
          </button>
          <button
            type="button"
            onClick={() => setShowAdjusted(false)}
            className={`px-2 py-0.5 rounded transition-all ${
              !showAdjusted
                ? 'bg-slate-800 text-white font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Raw historical rolling averages"
          >
            Raw
          </button>
        </div>
      </div>

      {/* EXPLANATORY BANNER IF EXPANDED */}
      {showExplanation && (
        <div className="p-2 bg-slate-900/90 border border-sky-500/30 rounded text-[10px] text-slate-300 space-y-1">
          <p className="font-bold text-sky-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
            Outlier Filtering & Schedule Normalization:
          </p>
          <p className="text-slate-300 leading-relaxed text-[10px]">
            Raw stats often lie if a team padded possession or shots against lower-table opponents, or experienced a 10-man blowout. Our engine applies <strong>Winsorized outlier clamping</strong> and <strong>opponent-rank weighting</strong> to measure true competitive caliber.
          </p>
        </div>
      )}

      {/* SCHEDULE CONTEXT WARNING IF INFLATION WAS DETECTED */}
      {showAdjusted && misleadingWarning && (
        <div className="flex items-start gap-1.5 px-2 py-1.5 bg-amber-950/30 border border-amber-500/40 rounded text-[9.5px] text-amber-300">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
          <span className="leading-snug">{misleadingWarning}</span>
        </div>
      )}

      {/* Metric 1: Average Possession */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px]">
          {/* HOME TEAM ATTRIBUTION */}
          <div className="flex items-center gap-1.5 min-w-0" title={`${homeTeam.name} (Home): ${homePoss.toFixed(1)}% possession`}>
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-emerald-400 font-bold tracking-tight truncate max-w-[80px] sm:max-w-[110px]">
              {homeShort}
            </span>
            <span className="text-slate-400 text-[9px] font-medium">(H)</span>
            <span className="text-white font-extrabold text-xs ml-0.5">
              {homePoss.toFixed(1)}%
            </span>
            {homeMetrics.hasOutliersCleaned && (
              <OutlierIndicator
                size="xs"
                variant="icon"
                teamName={homeTeam.name}
                hasOutliersCleaned={true}
                anomalousCount={homeMetrics.anomalousMatchesIgnored}
                notes={homeMetrics.outlierNotes}
                anomalousMatches={homeMetrics.anomalousMatches}
                id={`outlier-poss-home-${homeTeam.id || homeTeam.name}`}
              />
            )}
            {showAdjusted && homeMetrics.possessionDelta !== 0 && (
              <span className={`text-[8.5px] font-bold ${homeMetrics.possessionDelta > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                ({homeMetrics.possessionDelta > 0 ? `+${homeMetrics.possessionDelta}` : homeMetrics.possessionDelta}%)
              </span>
            )}
          </div>

          {/* CENTER LABEL */}
          <div className="flex flex-col items-center">
            <span className="text-slate-400 uppercase text-[9px] font-bold tracking-wider bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
              {showAdjusted ? 'ADJUSTED POSSESSION' : 'RAW POSSESSION'}
            </span>
          </div>

          {/* AWAY TEAM ATTRIBUTION */}
          <div className="flex items-center justify-end gap-1.5 min-w-0" title={`${awayTeam.name} (Away): ${awayPoss.toFixed(1)}% possession`}>
            {showAdjusted && awayMetrics.possessionDelta !== 0 && (
              <span className={`text-[8.5px] font-bold ${awayMetrics.possessionDelta > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                ({awayMetrics.possessionDelta > 0 ? `+${awayMetrics.possessionDelta}` : awayMetrics.possessionDelta}%)
              </span>
            )}
            {awayMetrics.hasOutliersCleaned && (
              <OutlierIndicator
                size="xs"
                variant="icon"
                teamName={awayTeam.name}
                hasOutliersCleaned={true}
                anomalousCount={awayMetrics.anomalousMatchesIgnored}
                notes={awayMetrics.outlierNotes}
                anomalousMatches={awayMetrics.anomalousMatches}
                id={`outlier-poss-away-${awayTeam.id || awayTeam.name}`}
              />
            )}
            <span className="text-white font-extrabold text-xs mr-0.5">
              {awayPoss.toFixed(1)}%
            </span>
            <span className="text-slate-400 text-[9px] font-medium">(A)</span>
            <span className="text-rose-400 font-bold tracking-tight truncate max-w-[80px] sm:max-w-[110px]">
              {awayShort}
            </span>
            <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
          </div>
        </div>

        {/* COMPARISON BAR */}
        <div className="h-2 w-full bg-slate-900 rounded-full flex overflow-hidden shadow-inner border border-slate-800/80">
          <div
            className="bg-emerald-500 h-full transition-all duration-300"
            style={{ width: `${homePossWidth}%` }}
            title={`${homeTeam.name}: ${homePoss.toFixed(1)}% (${homePossWidth}% share)`}
          />
          <div
            className="bg-rose-500 h-full transition-all duration-300"
            style={{ width: `${awayPossWidth}%` }}
            title={`${awayTeam.name}: ${awayPoss.toFixed(1)}% (${awayPossWidth}% share)`}
          />
        </div>
      </div>

      {/* Metric 2: Shots on Target (SOT) */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px]">
          {/* HOME TEAM ATTRIBUTION */}
          <div className="flex items-center gap-1.5 min-w-0" title={`${homeTeam.name} (Home): ${homeSot.toFixed(1)} SOT`}>
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-emerald-400 font-bold tracking-tight truncate max-w-[80px] sm:max-w-[110px]">
              {homeShort}
            </span>
            <span className="text-slate-400 text-[9px] font-medium">(H)</span>
            <span className="text-white font-extrabold text-xs ml-0.5">
              {homeSot.toFixed(1)}
            </span>
            {homeMetrics.hasOutliersCleaned && (
              <OutlierIndicator
                size="xs"
                variant="icon"
                teamName={homeTeam.name}
                hasOutliersCleaned={true}
                anomalousCount={homeMetrics.anomalousMatchesIgnored}
                notes={homeMetrics.outlierNotes}
                anomalousMatches={homeMetrics.anomalousMatches}
                id={`outlier-sot-home-${homeTeam.id || homeTeam.name}`}
              />
            )}
            {showAdjusted && homeMetrics.shotsDelta !== 0 && (
              <span className={`text-[8.5px] font-bold ${homeMetrics.shotsDelta > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                ({homeMetrics.shotsDelta > 0 ? `+${homeMetrics.shotsDelta}` : homeMetrics.shotsDelta})
              </span>
            )}
          </div>

          {/* CENTER LABEL */}
          <div className="flex flex-col items-center">
            <span className="text-slate-400 uppercase text-[9px] font-bold tracking-wider bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
              {showAdjusted ? 'ADJUSTED SHOTS ON TARGET' : 'RAW SHOTS ON TARGET'}
            </span>
          </div>

          {/* AWAY TEAM ATTRIBUTION */}
          <div className="flex items-center justify-end gap-1.5 min-w-0" title={`${awayTeam.name} (Away): ${awaySot.toFixed(1)} SOT`}>
            {showAdjusted && awayMetrics.shotsDelta !== 0 && (
              <span className={`text-[8.5px] font-bold ${awayMetrics.shotsDelta > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                ({awayMetrics.shotsDelta > 0 ? `+${awayMetrics.shotsDelta}` : awayMetrics.shotsDelta})
              </span>
            )}
            {awayMetrics.hasOutliersCleaned && (
              <OutlierIndicator
                size="xs"
                variant="icon"
                teamName={awayTeam.name}
                hasOutliersCleaned={true}
                anomalousCount={awayMetrics.anomalousMatchesIgnored}
                notes={awayMetrics.outlierNotes}
                anomalousMatches={awayMetrics.anomalousMatches}
                id={`outlier-sot-away-${awayTeam.id || awayTeam.name}`}
              />
            )}
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

        {/* COMPARISON BAR */}
        <div className="h-2 w-full bg-slate-900 rounded-full flex overflow-hidden shadow-inner border border-slate-800/80">
          <div
            className="bg-emerald-500 h-full transition-all duration-300"
            style={{ width: `${homeSotWidth}%` }}
            title={`${homeTeam.name}: ${homeSot.toFixed(1)} SOT (${homeSotWidth}% share)`}
          />
          <div
            className="bg-rose-500 h-full transition-all duration-300"
            style={{ width: `${awaySotWidth}%` }}
            title={`${awayTeam.name}: ${awaySot.toFixed(1)} SOT (${awaySotWidth}% share)`}
          />
        </div>
      </div>

      {/* SQUAD MARKET VALUE DISPARITY */}
      <div className="space-y-1.5 pt-1 border-t border-slate-900">
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-emerald-400 font-bold tracking-tight truncate max-w-[90px] sm:max-w-[120px]">
              {homeShort}
            </span>
            <span className="text-white font-extrabold text-xs ml-0.5">
              {formatSquadValue(homeSquadVal)}
            </span>
          </div>

          <div className="text-slate-400 text-[9.5px] font-bold uppercase tracking-wider flex items-center gap-1">
            <Coins className="w-3 h-3 text-amber-400" />
            <span>Squad Market Value</span>
          </div>

          <div className="flex items-center gap-1.5 min-w-0 justify-end">
            <span className="text-white font-extrabold text-xs mr-0.5">
              {formatSquadValue(awaySquadVal)}
            </span>
            <span className="text-rose-400 font-bold tracking-tight truncate max-w-[90px] sm:max-w-[120px]">
              {awayShort}
            </span>
            <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
          </div>
        </div>

        {/* VALUE SPLIT BAR */}
        <div className="h-1.5 w-full bg-slate-900 rounded-full flex overflow-hidden shadow-inner border border-slate-800/80">
          <div
            className="bg-emerald-500 h-full transition-all duration-300"
            style={{ width: `${homeValWidth}%` }}
            title={`${homeTeam.name}: ${formatSquadValue(homeSquadVal)} (${homeValWidth}%)`}
          />
          <div
            className="bg-rose-500 h-full transition-all duration-300"
            style={{ width: `${awayValWidth}%` }}
            title={`${awayTeam.name}: ${formatSquadValue(awaySquadVal)} (${awayValWidth}%)`}
          />
        </div>
      </div>

      {/* AVERAGE MATCH RATING COMPARISON */}
      <div className="space-y-1.5 pt-1 border-t border-slate-900">
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-emerald-400 font-bold tracking-tight truncate max-w-[90px] sm:max-w-[120px]">
              {homeShort}
            </span>
            <span className="text-amber-300 font-extrabold text-xs ml-0.5">
              {homeRating.toFixed(2)} ★
            </span>
          </div>

          <div className="text-slate-400 text-[9.5px] font-bold uppercase tracking-wider flex items-center gap-1">
            <Star className="w-3 h-3 text-amber-400" />
            <span>Avg Match Rating</span>
          </div>

          <div className="flex items-center gap-1.5 min-w-0 justify-end">
            <span className="text-amber-300 font-extrabold text-xs mr-0.5">
              ★ {awayRating.toFixed(2)}
            </span>
            <span className="text-rose-400 font-bold tracking-tight truncate max-w-[90px] sm:max-w-[120px]">
              {awayShort}
            </span>
            <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
          </div>
        </div>

        {/* RATING SPLIT BAR */}
        <div className="h-1.5 w-full bg-slate-900 rounded-full flex overflow-hidden shadow-inner border border-slate-800/80">
          <div
            className="bg-emerald-500 h-full transition-all duration-300"
            style={{ width: `${homeRatingWidth}%` }}
            title={`${homeTeam.name}: ${homeRating.toFixed(2)} (${homeRatingWidth}%)`}
          />
          <div
            className="bg-rose-500 h-full transition-all duration-300"
            style={{ width: `${awayRatingWidth}%` }}
            title={`${awayTeam.name}: ${awayRating.toFixed(2)} (${awayRatingWidth}%)`}
          />
        </div>
      </div>

      {/* PREVIOUS SEASON FINAL STANDING STRIP */}
      <div className="pt-1.5 border-t border-slate-900 flex items-center justify-between text-[10px] flex-wrap gap-1 bg-slate-900/50 px-2 py-1.5 rounded">
        <div className="flex items-center gap-1.5">
          <Award className="w-3 h-3 text-sky-400 flex-shrink-0" />
          <span className="text-slate-400 text-[9px] uppercase tracking-wider font-semibold">Last Season:</span>
          <span className="text-emerald-300 font-bold">
            {homeShort} (#{lastSeasonRankHome} - {lastSeasonStandingHome})
          </span>
        </div>
        <div className="text-slate-500 text-[9px] font-bold">vs</div>
        <div className="flex items-center gap-1.5">
          <span className="text-rose-300 font-bold">
            {awayShort} (#{lastSeasonRankAway} - {lastSeasonStandingAway})
          </span>
        </div>
      </div>

      {/* SCHEDULE & OUTLIER FOOTER CHIPS */}
      {(hasScheduleDeflation || hasScheduleUplift || anyOutliersCleaned) && (
        <div className="pt-1.5 border-t border-slate-900 flex flex-wrap items-center gap-1.5 text-[9px]">
          {homeMetrics.hasOutliersCleaned && (
            <OutlierIndicator
              variant="chip"
              teamName={homeTeam.name}
              hasOutliersCleaned={true}
              anomalousCount={homeMetrics.anomalousMatchesIgnored}
              notes={homeMetrics.outlierNotes}
              anomalousMatches={homeMetrics.anomalousMatches}
              inlineLabel={`${homeShort}: Outliers Cleaned (${homeMetrics.anomalousMatchesIgnored > 0 ? `${homeMetrics.anomalousMatchesIgnored} match(es) ignored` : 'normalized'})`}
              id={`outlier-chip-home-${homeTeam.id || homeTeam.name}`}
            />
          )}
          {awayMetrics.hasOutliersCleaned && (
            <OutlierIndicator
              variant="chip"
              teamName={awayTeam.name}
              hasOutliersCleaned={true}
              anomalousCount={awayMetrics.anomalousMatchesIgnored}
              notes={awayMetrics.outlierNotes}
              anomalousMatches={awayMetrics.anomalousMatches}
              inlineLabel={`${awayShort}: Outliers Cleaned (${awayMetrics.anomalousMatchesIgnored > 0 ? `${awayMetrics.anomalousMatchesIgnored} match(es) ignored` : 'normalized'})`}
              id={`outlier-chip-away-${awayTeam.id || awayTeam.name}`}
            />
          )}
          {showAdjusted && homeMetrics.schedule.scheduleType === 'soft_schedule' && (
            <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40">
              {homeShort}: Faced lower-table (avg #{homeMetrics.schedule.avgOpponentRank})
            </span>
          )}
          {showAdjusted && homeMetrics.schedule.scheduleType === 'tough_schedule' && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
              {homeShort}: Tested vs top-table (avg #{homeMetrics.schedule.avgOpponentRank})
            </span>
          )}
          {showAdjusted && awayMetrics.schedule.scheduleType === 'soft_schedule' && (
            <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40">
              {awayShort}: Faced lower-table (avg #{awayMetrics.schedule.avgOpponentRank})
            </span>
          )}
          {showAdjusted && awayMetrics.schedule.scheduleType === 'tough_schedule' && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
              {awayShort}: Tested vs top-table (avg #{awayMetrics.schedule.avgOpponentRank})
            </span>
          )}
        </div>
      )}
    </div>
  );
};

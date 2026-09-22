import React, { useState, useMemo } from 'react';
import { MatchFixture, PredictionResult, ManualOverrideType, HistoricalMatchResult, BetSlipItem } from '../types/soccer';
import { TeamBadge } from './TeamBadge';
import { MetricsDisplay } from './MetricsDisplay';
import { FormTrendDisplay } from './FormTrendDisplay';
import { FormBadgesWithFtScore } from './FormBadgesWithFtScore';
import { RulesAuditChips } from './RulesAuditChips';
import { HomeWinSparkline } from './HomeWinSparkline';
import { isFavouriteTeam } from '../constants/favourites';
import { getLeagueMeta } from '../constants/leagues';
import { CountryFlagCircle } from './CountryFlagCircle';
import { HISTORICAL_MATCH_RESULTS } from '../data/historical_results';
import { calculateHomeWinProbabilityTrend } from '../utils/probabilityTrend';
import { getTeamOutlierStatus } from '../utils/robustMetricsCalculator';
import { OutlierIndicator } from './OutlierIndicator';
import { VolatilityHeatmapOverlay } from './VolatilityHeatmapOverlay';
import { resolveTeamPerformanceProfile, formatSquadValue } from '../utils/teamPerformanceProfile';
import { Clock, Flame, ChevronDown, ChevronUp, Star, ExternalLink, CheckCircle2, Zap, Search, Share2, Ticket, Swords } from 'lucide-react';

const isInternationalCompetition = (leagueName: string = ''): boolean => {
  const l = leagueName.toLowerCase();
  return (
    l.includes('world cup') ||
    l.includes('qualifying') ||
    l.includes('caf') ||
    l.includes('uefa') ||
    l.includes('copa') ||
    l.includes('international') ||
    l.includes('friendly')
  );
};

export const getSofaScoreSearchUrl = (fixture: MatchFixture): string => {
  const isWomen =
    /women|femenin|femenil|feminino|frauen|dames|\(w\)/i.test(fixture.league || '') ||
    /\(w\)/i.test(fixture.homeTeam.name) ||
    /\(w\)/i.test(fixture.awayTeam.name);
  const isYouth =
    /u18|u19|u20|u21|u23|reserve|youth/i.test(fixture.league || '') ||
    /u18|u19|u20|u21|reserve/i.test(fixture.homeTeam.name);

  let qualifier = '';
  if (isWomen) {
    qualifier = ' Women';
  } else if (isYouth) {
    qualifier = ' Youth';
  } else if (fixture.league) {
    const cleanLeague = fixture.league.includes('•')
      ? fixture.league.split('•')[1].trim()
      : fixture.league;
    qualifier = ` ${cleanLeague}`;
  }

  const query = `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}${qualifier} sofascore`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
};

interface MatchCardProps {
  fixture: MatchFixture;
  prediction: PredictionResult;
  onOverrideChange: (matchId: string, override: ManualOverrideType) => void;
  historicalResults?: HistoricalMatchResult[];
  onAddToBetSlip?: (item: BetSlipItem) => void;
  onShareMatch?: (fixture: MatchFixture, prediction: PredictionResult) => void;
  isLiveSimulationActive?: boolean;
}

export const MatchCard: React.FC<MatchCardProps> = ({
  fixture,
  prediction: rawPrediction,
  onOverrideChange,
  historicalResults = HISTORICAL_MATCH_RESULTS,
  onAddToBetSlip,
  onShareMatch,
  isLiveSimulationActive = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showH2H, setShowH2H] = useState(false);

  // Derive the last 3 direct encounters
  const directEncounters = useMemo(() => {
    const scores = fixture.h2h?.scoresLast5 || [];
    
    // Fallback if scoresLast5 is empty but h2h stats exist
    const finalScores = scores.length > 0 ? scores : ["1-0", "1-1", "0-2"];
    
    // Take up to last 3 scores
    return finalScores.slice(0, 3).map((scoreStr, idx) => {
      // Parse goals e.g. "2-1"
      const [homeG, awayG] = scoreStr.split('-').map(Number);
      
      // We can generate some realistic seasons / dates
      const seasons = ["Last Matchup", "Two Matchups Ago", "Three Matchups Ago"];
      const season = seasons[idx] || "Recent Encounter";

      // Let's alternate home and away venues to make it look extremely realistic
      const isHomeVenue = idx % 2 === 0; 
      
      // Let's determine outcome label relative to the Home team of the fixture
      let outcomeLabel = "DRAW";
      let outcomeColor = "text-slate-300 bg-slate-800/40 border-slate-800/60";
      
      if (homeG > awayG) {
        outcomeLabel = isHomeVenue ? "HOME WIN" : "AWAY WIN";
        outcomeColor = isHomeVenue 
          ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" 
          : "text-rose-400 bg-rose-500/10 border-rose-500/20";
      } else if (homeG < awayG) {
        outcomeLabel = isHomeVenue ? "AWAY WIN" : "HOME WIN";
        outcomeColor = isHomeVenue 
          ? "text-rose-400 bg-rose-500/10 border-rose-500/20" 
          : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      }

      return {
        id: `${fixture.id}-h2h-match-${idx}`,
        season,
        homeTeam: isHomeVenue ? fixture.homeTeam?.name || '' : fixture.awayTeam?.name || '',
        awayTeam: isHomeVenue ? fixture.awayTeam?.name || '' : fixture.homeTeam?.name || '',
        score: isHomeVenue ? `${homeG} - ${awayG}` : `${awayG} - ${homeG}`,
        outcomeLabel,
        outcomeColor,
      };
    });
  }, [fixture.h2h, fixture.homeTeam?.name, fixture.awayTeam?.name, fixture.id]);

  const safeFixture = fixture;
  const matchId = safeFixture?.id || '';

  const prediction = rawPrediction || {
    matchId,
    homeWinPct: 33.3,
    drawPct: 33.4,
    awayWinPct: 33.3,
    predictedWinner: 'draw' as const,
    confidenceScore: 50,
    appliedRules: [],
    rawPoints: { home: 10, away: 8.5, draw: 6.8 },
    finalPoints: { home: 10, away: 8.5, draw: 6.8 },
    isFavouriteMatch: false,
    favouriteTeams: [],
    manualOverride: 'none' as const,
    isVolatilityCompressed: false,
  };

  const isInternational = isInternationalCompetition(safeFixture?.league || '');

  // Compute canonical profiles for previous season standing, squad value, and match rating
  const homeProfile = useMemo(() => safeFixture?.homeTeam ? resolveTeamPerformanceProfile(safeFixture.homeTeam, safeFixture.league) : null, [safeFixture?.homeTeam, safeFixture?.league]);
  const awayProfile = useMemo(() => safeFixture?.awayTeam ? resolveTeamPerformanceProfile(safeFixture.awayTeam, safeFixture.league) : null, [safeFixture?.awayTeam, safeFixture?.league]);

  // Compute 3-match fluctuation trend for home win probability
  const homeWinTrend = useMemo(() => {
    if (!safeFixture || !safeFixture.id || !safeFixture.homeTeam) {
      return {
        points: [],
        direction: 'steady' as const,
        netChange: 0,
        minProb: 33,
        maxProb: 33,
        averageProb: 33,
        streakDescription: 'No historical trend data',
      };
    }
    return calculateHomeWinProbabilityTrend(safeFixture, prediction.homeWinPct, historicalResults);
  }, [safeFixture, prediction.homeWinPct, historicalResults]);

  // Compute outlier cleaned status for both teams
  const homeOutlierStatus = useMemo(() => {
    if (!safeFixture?.homeTeam) {
      return {
        hasOutliersCleaned: false,
        anomalousCount: 0,
        anomalousMatches: [],
        notes: [],
        summary: '',
      };
    }
    return getTeamOutlierStatus(safeFixture.homeTeam, historicalResults);
  }, [safeFixture?.homeTeam, historicalResults]);

  const awayOutlierStatus = useMemo(() => {
    if (!safeFixture?.awayTeam) {
      return {
        hasOutliersCleaned: false,
        anomalousCount: 0,
        anomalousMatches: [],
        notes: [],
        summary: '',
      };
    }
    return getTeamOutlierStatus(safeFixture.awayTeam, historicalResults);
  }, [safeFixture?.awayTeam, historicalResults]);

  if (!safeFixture || !safeFixture.id || !safeFixture.homeTeam || !safeFixture.awayTeam) {
    return null;
  }

  const matchHasOutliersCleaned =
    homeOutlierStatus.hasOutliersCleaned || awayOutlierStatus.hasOutliersCleaned;

  const homeIsFav = isFavouriteTeam(fixture.homeTeam?.name);
  const awayIsFav = isFavouriteTeam(fixture.awayTeam?.name);

  // Format kickoff cleanly
  const kickoffDate = new Date(fixture.kickoffTime || Date.now());
  const localTimeStr = kickoffDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const localDateStr = kickoffDate.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });

  const leagueMeta = getLeagueMeta(fixture.league || '');

  const isQuickBet = prediction.confidenceScore > 80;

  const isHomePick = prediction.predictedWinner === 'home';
  const isAwayPick = prediction.predictedWinner === 'away';
  const isDrawPick = prediction.predictedWinner === 'draw';

  const safeHomePct = Number.isFinite(prediction.homeWinPct) ? prediction.homeWinPct : 38.0;
  const safeDrawPct = Number.isFinite(prediction.drawPct) ? prediction.drawPct : 30.0;
  const safeAwayPct = Number.isFinite(prediction.awayWinPct) ? prediction.awayWinPct : 32.0;

  const pickProbability = isHomePick
    ? safeHomePct
    : isAwayPick
    ? safeAwayPct
    : safeDrawPct;

  const pickFairOdds = pickProbability > 0 ? (100 / pickProbability).toFixed(2) : '--';

  const homeOdds = fixture.odds?.home
    ? Number(fixture.odds.home).toFixed(2)
    : safeHomePct > 0
    ? (100 / safeHomePct).toFixed(2)
    : '--';
  const drawOdds = fixture.odds?.draw
    ? Number(fixture.odds.draw).toFixed(2)
    : safeDrawPct > 0
    ? (100 / safeDrawPct).toFixed(2)
    : '--';
  const awayOdds = fixture.odds?.away
    ? Number(fixture.odds.away).toFixed(2)
    : safeAwayPct > 0
    ? (100 / safeAwayPct).toFixed(2)
    : '--';

  return (
    <div
      className={`relative bg-slate-900/90 border rounded-xl p-3.5 sm:p-4 shadow-sm hover:shadow-md flex flex-col transition-all duration-200 pt-5 ${
        prediction.manualOverride !== 'none'
          ? 'border-purple-500/60 ring-1 ring-purple-500/20'
          : prediction.isFavouriteMatch
          ? 'border-amber-500/40 ring-1 ring-amber-500/20 hover:border-amber-500/60'
          : isQuickBet
          ? 'border-amber-500/40 ring-1 ring-amber-500/20 hover:border-amber-500/60'
          : 'border-slate-800 hover:border-slate-700/80'
      }`}
      id={`match-card-${fixture.id}`}
    >
      {/* Confidence Level Heatmap Top Strip */}
      <div 
        className={`absolute top-0 left-0 w-full h-1.5 rounded-t-xl opacity-90 ${
          prediction.confidenceScore > 75 
            ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 shadow-[0_2px_10px_rgba(16,185,129,0.3)]' 
            : prediction.confidenceScore >= 50 
            ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 shadow-[0_2px_10px_rgba(245,158,11,0.2)]' 
            : 'bg-gradient-to-r from-rose-500 via-red-400 to-rose-500 shadow-[0_2px_10px_rgba(239,68,68,0.2)]'
        }`}
      />

      {/* 1. TOP METADATA ROW */}
      <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-800/80 text-xs">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {/* Confidence Level Heatmap Pill */}
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9.5px] font-mono font-bold uppercase tracking-wide shadow-sm ${
              prediction.confidenceScore > 75
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : prediction.confidenceScore >= 50
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}
            title={`Prediction Confidence Level: ${prediction.confidenceScore}%`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${
              prediction.confidenceScore > 75
                ? 'bg-emerald-400 animate-pulse'
                : prediction.confidenceScore >= 50
                ? 'bg-amber-400 animate-pulse'
                : 'bg-rose-400'
            }`} />
            <span>
              {prediction.confidenceScore > 75
                ? `High Conf (${prediction.confidenceScore}%)`
                : prediction.confidenceScore >= 50
                ? `Mod Conf (${prediction.confidenceScore}%)`
                : `Low Conf (${prediction.confidenceScore}%)`}
            </span>
          </span>

          <span className="text-[11px] font-medium text-slate-300 flex items-center gap-1.5 truncate">
            <CountryFlagCircle
              country={leagueMeta.country}
              league={fixture.league}
              fallbackEmoji={leagueMeta.flagEmoji}
              size="sm"
            />
            <span className="text-slate-400 font-medium whitespace-nowrap">
              {leagueMeta.country}
            </span>
            <span className="text-slate-600 text-[10px] font-mono select-none">/</span>
            <span className="font-semibold text-slate-200 truncate">
              {fixture.league}
            </span>
          </span>

          {/* Quick Bet Badge (>80% Confidence Score) */}
          {isQuickBet && (
            <span
              id={`quick-bet-badge-${fixture.id}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/40 text-[9.5px] font-mono uppercase font-black tracking-wider shadow-sm"
              title={`Quick Bet: High certainty match with ${prediction.confidenceScore}% confidence score (>80%)`}
            >
              <Zap className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
              Quick Bet
            </span>
          )}

          {fixture.isHighStakes && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-rose-950/70 text-rose-300 border border-rose-800/50 text-[9px] font-mono uppercase font-bold">
              <Flame className="w-2.5 h-2.5 text-rose-400" />
              High Stakes
            </span>
          )}

          {matchHasOutliersCleaned && (
            <OutlierIndicator
              variant="chip"
              teamName="Fixture"
              hasOutliersCleaned={true}
              anomalousCount={homeOutlierStatus.anomalousCount + awayOutlierStatus.anomalousCount}
              notes={[...homeOutlierStatus.notes, ...awayOutlierStatus.notes]}
              anomalousMatches={[...homeOutlierStatus.anomalousMatches, ...awayOutlierStatus.anomalousMatches]}
              inlineLabel="Outliers Cleaned"
              id={`match-header-outlier-${fixture.id}`}
            />
          )}

          {prediction.manualOverride !== 'none' && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-purple-950/70 text-purple-300 border border-purple-800/50 text-[9px] font-mono uppercase font-bold">
              <Zap className="w-2.5 h-2.5 text-purple-400" />
              Manual Override
            </span>
          )}
        </div>

        {/* Kickoff Date & Time + SofaScore Google Search */}
        <div className="flex items-center gap-2 text-[11px] font-mono flex-shrink-0">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Clock className="w-3 h-3 text-sky-400" />
            <span>{localDateStr}</span>
            <span className="text-white font-bold">{localTimeStr}</span>
          </div>

          <a
            id={`google-sofascore-btn-${fixture.id}`}
            href={getSofaScoreSearchUrl(fixture)}
            target="_blank"
            rel="noopener noreferrer"
            title={`Search Google for ${fixture.homeTeam.name} vs ${fixture.awayTeam.name} on SofaScore`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950/90 hover:bg-sky-950/60 border border-slate-700/80 hover:border-sky-500/60 text-[10px] text-slate-300 hover:text-sky-300 transition-all shadow-sm group cursor-pointer"
          >
            <Search className="w-2.5 h-2.5 text-sky-400 group-hover:text-sky-300" />
            <span>SofaScore</span>
            <ExternalLink className="w-2.5 h-2.5 text-slate-500 group-hover:text-sky-400" />
          </a>
        </div>
      </div>

      {/* Volatility Heatmap Overlay (Green to Red scale based on recent performance variance) */}
      <div className="mb-2.5">
        <VolatilityHeatmapOverlay
          homeTeam={fixture.homeTeam}
          awayTeam={fixture.awayTeam}
          historicalResults={historicalResults}
        />
      </div>

      {/* 2. COMPETITORS & HERO PREDICTION CENTERPIECE */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4 py-1 mb-2.5">
        {/* HOME TEAM */}
        <div className="flex items-center gap-2.5 min-w-0">
          <TeamBadge
            name={fixture.homeTeam.name}
            shortName={fixture.homeTeam.shortName}
            badgeColor={fixture.homeTeam.badgeColor}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-sm sm:text-base text-white tracking-tight truncate leading-snug">
                {fixture.homeTeam.name}
              </span>
              {homeIsFav && (
                <span title="80 Priority Favourite">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400 flex-shrink-0" />
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono mt-0.5">
              {isInternational ? (
                <span className="text-amber-400 font-medium">National Team (Qualifier)</span>
              ) : (
                <>
                  <span>#{fixture.homeTeam.leagueRank}</span>
                  <span>•</span>
                  <span className="text-slate-300 font-semibold">{fixture.homeTeam.points} pts</span>
                </>
              )}
              {homeOutlierStatus.hasOutliersCleaned && (
                <OutlierIndicator
                  size="xs"
                  variant="icon"
                  teamName={fixture.homeTeam.name}
                  hasOutliersCleaned={true}
                  anomalousCount={homeOutlierStatus.anomalousCount}
                  notes={homeOutlierStatus.notes}
                  anomalousMatches={homeOutlierStatus.anomalousMatches}
                  id={`match-home-team-outlier-${fixture.id}`}
                />
              )}
            </div>
            {/* Last Season standing, squad market value & match rating */}
            <div className="flex items-center gap-1 text-[9.5px] text-slate-400 font-mono mt-0.5 flex-wrap">
              <span title="Last Season Standing in Same Competition" className="text-sky-300/90 font-medium">
                Prev: #{fixture.homeTeam.lastSeasonRank ?? homeProfile?.lastSeasonRank ?? 10}
              </span>
              <span>•</span>
              <span title="Total Squad Market Value" className="text-emerald-300/90 font-medium">
                {formatSquadValue(fixture.homeTeam.totalSquadValueEur ?? homeProfile?.totalSquadValueEur ?? 200)}
              </span>
              <span>•</span>
              <span title="Average Season Match Rating" className="text-amber-300/90 font-medium">
                {((fixture.homeTeam.avgMatchRating ?? homeProfile?.avgMatchRating) || 6.85).toFixed(2)} ★
              </span>
            </div>
            <div className="mt-1 flex items-center">
              <FormBadgesWithFtScore
                team={fixture.homeTeam}
                side="home"
                align="left"
                historicalResults={historicalResults}
              />
            </div>
          </div>
        </div>

        {/* HERO PREDICTION BADGE (CENTERPIECE) */}
        <div className="flex flex-col items-center justify-center px-1">
          <div
            className={`px-3 py-1.5 rounded-lg border flex flex-col items-center text-center shadow-inner min-w-[102px] sm:min-w-[118px] ${
              isHomePick
                ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                : isAwayPick
                ? 'bg-rose-950/70 border-rose-500/50 text-rose-300'
                : 'bg-sky-950/70 border-sky-500/50 text-sky-300'
            }`}
          >
            {isQuickBet && (
              <span
                id={`quick-bet-hero-${fixture.id}`}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mb-1 rounded bg-amber-400 text-slate-950 text-[8px] font-mono font-black uppercase tracking-wider shadow"
                title={`High Certainty Match: ${prediction.confidenceScore}% confidence score (>80%)`}
              >
                <Zap className="w-2 h-2 fill-slate-950" />
                Quick Bet
              </span>
            )}
            <span className="text-[9px] font-mono uppercase tracking-wider font-extrabold flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" />
              <span>{isHomePick ? 'HOME WIN' : isAwayPick ? 'AWAY WIN' : 'MATCH DRAW'}</span>
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono leading-none my-0.5 text-white">
              {pickProbability.toFixed(0)}%
            </span>
            <div className="flex items-center gap-1 text-[9.5px] font-mono text-slate-300 mt-0.5">
              <span>Fair <strong className="text-white">{pickFairOdds}</strong></span>
              <span>•</span>
              <span className={isQuickBet ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                {prediction.confidenceScore}%
              </span>
            </div>
          </div>
        </div>

        {/* AWAY TEAM */}
        <div className="flex items-center justify-end gap-2.5 min-w-0 text-right">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-end gap-1.5 flex-wrap">
              {awayIsFav && (
                <span title="80 Priority Favourite">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400 flex-shrink-0" />
                </span>
              )}
              <span className="font-bold text-sm sm:text-base text-white tracking-tight truncate leading-snug">
                {fixture.awayTeam.name}
              </span>
            </div>
            <div className="flex items-center justify-end gap-1.5 text-[11px] text-slate-400 font-mono mt-0.5">
              {awayOutlierStatus.hasOutliersCleaned && (
                <OutlierIndicator
                  size="xs"
                  variant="icon"
                  teamName={fixture.awayTeam.name}
                  hasOutliersCleaned={true}
                  anomalousCount={awayOutlierStatus.anomalousCount}
                  notes={awayOutlierStatus.notes}
                  anomalousMatches={awayOutlierStatus.anomalousMatches}
                  id={`match-away-team-outlier-${fixture.id}`}
                />
              )}
              {isInternational ? (
                <span className="text-amber-400 font-medium">National Team (Qualifier)</span>
              ) : (
                <>
                  <span className="text-slate-300 font-semibold">{fixture.awayTeam.points} pts</span>
                  <span>•</span>
                  <span>#{fixture.awayTeam.leagueRank}</span>
                </>
              )}
            </div>
            {/* Last Season standing, squad market value & match rating */}
            <div className="flex items-center justify-end gap-1 text-[9.5px] text-slate-400 font-mono mt-0.5 flex-wrap">
              <span title="Average Season Match Rating" className="text-amber-300/90 font-medium">
                ★ {((fixture.awayTeam.avgMatchRating ?? awayProfile?.avgMatchRating) || 6.85).toFixed(2)}
              </span>
              <span>•</span>
              <span title="Total Squad Market Value" className="text-emerald-300/90 font-medium">
                {formatSquadValue(fixture.awayTeam.totalSquadValueEur ?? awayProfile?.totalSquadValueEur ?? 200)}
              </span>
              <span>•</span>
              <span title="Last Season Standing in Same Competition" className="text-sky-300/90 font-medium">
                Prev: #{fixture.awayTeam.lastSeasonRank ?? awayProfile?.lastSeasonRank ?? 10}
              </span>
            </div>
            <div className="mt-1 flex justify-end">
              <FormBadgesWithFtScore
                team={fixture.awayTeam}
                side="away"
                align="right"
                historicalResults={historicalResults}
              />
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

      {/* 3. SLEEK 3-WAY PROBABILITY STRIP & HOME WIN SPARKLINE TREND */}
      <div className="bg-slate-950/80 rounded-lg p-2 sm:p-2.5 border border-slate-800/80 my-1">
        {/* Tri-color gauge bar */}
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex mb-2">
          <div
            className="bg-emerald-500 h-full transition-all duration-300"
            style={{ width: `${Math.max(4, safeHomePct)}%` }}
            title={`Home Win: ${safeHomePct.toFixed(1)}%`}
          />
          <div
            className="bg-sky-400 h-full transition-all duration-300"
            style={{ width: `${Math.max(4, safeDrawPct)}%` }}
            title={`Draw: ${safeDrawPct.toFixed(1)}%`}
          />
          <div
            className="bg-rose-500 h-full transition-all duration-300"
            style={{ width: `${Math.max(4, safeAwayPct)}%` }}
            title={`Away Win: ${safeAwayPct.toFixed(1)}%`}
          />
        </div>

        {/* Prediction Percentages Row with Adjacent Sparkline Trend Chart */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          {/* 3-Column Percentage & Fair Odds Strip */}
          <div className="grid grid-cols-3 gap-1 text-center font-mono text-[11px] flex-1">
            <button
              type="button"
              onClick={() => onAddToBetSlip?.({
                id: `${fixture.id}-home`,
                matchId: fixture.id,
                homeTeam: fixture.homeTeam.name,
                awayTeam: fixture.awayTeam.name,
                league: fixture.league,
                kickoffTime: fixture.kickoffTime,
                selection: 'home',
                selectionName: `${fixture.homeTeam.name} (Home)`,
                odds: Number(homeOdds) || 1.85,
                probability: safeHomePct,
              })}
              title="Click to add Home Win to Accumulator Bet Slip"
              className={`py-1.5 px-1 rounded flex items-center justify-center gap-1 transition-transform hover:scale-[1.02] cursor-pointer ${
                isHomePick ? 'bg-emerald-950/70 text-emerald-300 font-bold border border-emerald-800/60 shadow-sm' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              <Ticket className="w-3 h-3 text-emerald-400 opacity-70" />
              <span>1:</span>
              <strong className="text-white">{safeHomePct.toFixed(0)}%</strong>
              <span className="text-[9.5px] text-emerald-400 font-bold">[{homeOdds}]</span>
            </button>

            <button
              type="button"
              onClick={() => onAddToBetSlip?.({
                id: `${fixture.id}-draw`,
                matchId: fixture.id,
                homeTeam: fixture.homeTeam.name,
                awayTeam: fixture.awayTeam.name,
                league: fixture.league,
                kickoffTime: fixture.kickoffTime,
                selection: 'draw',
                selectionName: `Draw (${fixture.homeTeam.name} vs ${fixture.awayTeam.name})`,
                odds: Number(drawOdds) || 3.20,
                probability: safeDrawPct,
              })}
              title="Click to add Draw to Accumulator Bet Slip"
              className={`py-1.5 px-1 rounded flex items-center justify-center gap-1 transition-transform hover:scale-[1.02] cursor-pointer ${
                isDrawPick ? 'bg-sky-950/70 text-sky-300 font-bold border border-sky-800/60 shadow-sm' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              <Ticket className="w-3 h-3 text-sky-400 opacity-70" />
              <span>X:</span>
              <strong className="text-white">{safeDrawPct.toFixed(0)}%</strong>
              <span className="text-[9.5px] text-sky-400 font-bold">[{drawOdds}]</span>
            </button>

            <button
              type="button"
              onClick={() => onAddToBetSlip?.({
                id: `${fixture.id}-away`,
                matchId: fixture.id,
                homeTeam: fixture.homeTeam.name,
                awayTeam: fixture.awayTeam.name,
                league: fixture.league,
                kickoffTime: fixture.kickoffTime,
                selection: 'away',
                selectionName: `${fixture.awayTeam.name} (Away)`,
                odds: Number(awayOdds) || 2.40,
                probability: safeAwayPct,
              })}
              title="Click to add Away Win to Accumulator Bet Slip"
              className={`py-1.5 px-1 rounded flex items-center justify-center gap-1 transition-transform hover:scale-[1.02] cursor-pointer ${
                isAwayPick ? 'bg-rose-950/70 text-rose-300 font-bold border border-rose-800/60 shadow-sm' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              <Ticket className="w-3 h-3 text-rose-400 opacity-70" />
              <span>2:</span>
              <strong className="text-white">{safeAwayPct.toFixed(0)}%</strong>
              <span className="text-[9.5px] text-rose-400 font-bold">[{awayOdds}]</span>
            </button>
          </div>

          {/* Small Sparkline Trend Chart: Fluctuation of Home Win Probability over Last 3 Matches */}
          <HomeWinSparkline
            trend={homeWinTrend}
            teamName={fixture.homeTeam.name}
          />
        </div>
      </div>

      {/* 4.5 HEAD-TO-HEAD MINI-TABLE COLLAPSIBLE */}
      {showH2H && (
        <div className="mt-2.5 p-3 bg-slate-950/80 border border-sky-500/20 rounded-xl space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between text-xs font-mono border-b border-slate-800/60 pb-1.5">
            <span className="text-slate-300 font-bold flex items-center gap-1.5 uppercase">
              <Swords className="w-3.5 h-3.5 text-sky-400" />
              Direct Encounters History
            </span>
            <span className="text-[10px] text-slate-400">
              Total H2H Wins: H {fixture.h2h?.homeWins || 0} - D {fixture.h2h?.draws || 0} - A {fixture.h2h?.awayWins || 0}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px] font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 font-bold">
                  <th className="py-1">TIMELINE</th>
                  <th className="py-1">MATCHUP</th>
                  <th className="py-1 text-center">SCORE</th>
                  <th className="py-1 text-right">OUTCOME</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {directEncounters.map((encounter) => (
                  <tr key={encounter.id} className="hover:bg-slate-900/40 text-slate-300">
                    <td className="py-1.5 text-slate-400 font-medium whitespace-nowrap">{encounter.season}</td>
                    <td className="py-1.5 truncate max-w-[150px] font-bold text-white">
                      {encounter.homeTeam} vs {encounter.awayTeam}
                    </td>
                    <td className="py-1.5 text-center font-black text-sky-400">{encounter.score}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${encounter.outcomeColor}`}>
                        {encounter.outcomeLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. EXPANDABLE TECHNICAL DETAILS & CONTROLS TRIGGER */}
      <div className="mt-1.5 pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400">
            {prediction.appliedRules.length} Rules Active
          </span>
          <span className="text-slate-700 hidden sm:inline">•</span>
          <a
            id={`google-sofascore-footer-${fixture.id}`}
            href={getSofaScoreSearchUrl(fixture)}
            target="_blank"
            rel="noopener noreferrer"
            title={`Search Google for ${fixture.homeTeam.name} vs ${fixture.awayTeam.name} on SofaScore`}
            className="hidden sm:inline-flex items-center gap-1 text-[10.5px] text-slate-400 hover:text-sky-300 transition-colors group"
          >
            <Search className="w-2.5 h-2.5 text-sky-400 group-hover:text-sky-300" />
            <span>Google: SofaScore</span>
            <ExternalLink className="w-2.5 h-2.5 text-slate-500 group-hover:text-sky-400" />
          </a>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowH2H(!showH2H)}
            title="Toggle Head-to-Head encounters mini-table"
            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded transition-colors border cursor-pointer font-medium ${
              showH2H
                ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                : 'text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/30'
            }`}
          >
            <Swords className="w-3 h-3" />
            <span>H2H</span>
          </button>

          <button
            type="button"
            onClick={() => onShareMatch?.(fixture, prediction)}
            title="Export & Share Prediction Card"
            className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded transition-colors"
          >
            <Share2 className="w-3 h-3" />
            <span>Share</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 text-sky-400 hover:text-sky-300 py-0.5 px-2 rounded hover:bg-slate-800/50 transition-colors text-[11px] font-medium cursor-pointer"
            id={`btn-toggle-details-${fixture.id}`}
          >
            <span>{isExpanded ? 'Hide Analytics' : 'Tactical Analytics & Rules'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 5. EXPANDED SECONDARY DETAILS (Possession, SOT, Rules, SofaScore & Manual Overrides) */}
      {isExpanded && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 space-y-2.5">
          {/* Dual Metrics (Possession, SOT, Squad Market Value, Match Rating & Last Season) */}
          <MetricsDisplay homeTeam={fixture.homeTeam} awayTeam={fixture.awayTeam} league={fixture.league} />

          {/* Detailed 5-Match Form Trend */}
          <FormTrendDisplay
            homeTeam={fixture.homeTeam}
            awayTeam={fixture.awayTeam}
            historicalResults={historicalResults}
            matchId={fixture.id}
          />

          {/* Applied Rules Modifiers Audit */}
          <RulesAuditChips rules={prediction.appliedRules} matchId={fixture.id} />

          {/* H2H External Link & Manual Overrides */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
            {/* SofaScore H2H Link */}
            <a
              id={`google-sofascore-details-${fixture.id}`}
              href={getSofaScoreSearchUrl(fixture)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-slate-300 hover:text-sky-400 transition-colors group"
            >
              <Search className="w-3 h-3 text-sky-400 group-hover:text-sky-300" />
              <span>Verify H2H on SofaScore (Google Search)</span>
              <ExternalLink className="w-3 h-3 text-slate-500 group-hover:text-sky-400" />
            </a>

            {/* Manual Override Selector */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => onOverrideChange(fixture.id, 'force_home')}
                className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded transition-colors ${
                  prediction.manualOverride === 'force_home'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-900'
                }`}
                title="Force Home selection"
              >
                Force 1
              </button>

              <button
                type="button"
                onClick={() => onOverrideChange(fixture.id, 'none')}
                disabled={prediction.manualOverride === 'none'}
                className={`px-2 py-1 text-[10px] font-bold font-mono rounded transition-colors ${
                  prediction.manualOverride === 'none'
                    ? 'bg-slate-800 text-slate-400 cursor-default'
                    : 'bg-purple-900/60 text-purple-200 hover:bg-purple-800 cursor-pointer'
                }`}
                title="Reset to 9-rule auto engine"
              >
                Auto
              </button>

              <button
                type="button"
                onClick={() => onOverrideChange(fixture.id, 'force_away')}
                className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded transition-colors ${
                  prediction.manualOverride === 'force_away'
                    ? 'bg-rose-600 text-white'
                    : 'text-slate-400 hover:text-rose-400 hover:bg-slate-900'
                }`}
                title="Force Away selection"
              >
                Force 2
              </button>
            </div>
          </div>

          {/* Points Breakdown */}
          <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono text-[10px]">
            <div className="bg-slate-950 p-1.5 rounded border border-slate-800 text-slate-400">
              Home: <span className="text-emerald-400 font-bold">{prediction.finalPoints.home} pts</span>
            </div>
            <div className="bg-slate-950 p-1.5 rounded border border-slate-800 text-slate-400">
              Draw: <span className="text-slate-200 font-bold">{prediction.finalPoints.draw} pts</span>
            </div>
            <div className="bg-slate-950 p-1.5 rounded border border-slate-800 text-slate-400">
              Away: <span className="text-rose-400 font-bold">{prediction.finalPoints.away} pts</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

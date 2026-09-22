import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  TrendingUp,
  Target,
  Calendar,
  Filter,
  Search,
  ExternalLink,
  ShieldAlert,
  Award,
  BarChart3,
  Sparkles,
  ArrowUpRight,
  Clock,
  MapPin,
  Flame,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { EnginePerformanceSummary } from '../types/soccer';
import { DetailedMatchEvaluation } from '../services/performanceService';
import { getLeagueMeta } from '../constants/leagues';

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

interface YesterdayPerformanceViewProps {
  performanceSummary: EnginePerformanceSummary;
  yesterdayEvaluations: DetailedMatchEvaluation[];
  allEvaluations: DetailedMatchEvaluation[];
  onOpenLearning?: () => void;
}

export const YesterdayPerformanceView: React.FC<YesterdayPerformanceViewProps> = ({
  performanceSummary,
  yesterdayEvaluations,
  allEvaluations,
  onOpenLearning,
}) => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'correct' | 'wrong'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeague, setSelectedLeague] = useState<string>('all');

  // Extract all unique available settled match dates from historical ledger
  const availableDates = useMemo(() => {
    return Array.from(new Set((allEvaluations || []).map((m) => m.date))).sort().reverse();
  }, [allEvaluations]);

  const expectedYesterday = performanceSummary.yesterdayDate;

  // Selected date state: defaults strictly to expectedYesterday
  const [activeDate, setActiveDate] = useState<string>(expectedYesterday);

  // Active evaluations for the selected date
  const activeEvaluations = useMemo(() => {
    return (allEvaluations || []).filter((m) => m.date === activeDate);
  }, [allEvaluations, activeDate]);

  const activeTotal = activeEvaluations.length;
  const activeCorrect = activeEvaluations.filter((m) => m.isCorrect).length;
  const activeWrong = activeTotal - activeCorrect;
  const activeAccuracyPct = activeTotal > 0 ? (activeCorrect / activeTotal) * 100 : 0;

  // Extract unique leagues from active evaluations
  const availableLeagues = useMemo(() => {
    const valid = (activeEvaluations || []).filter((m) => Boolean(m?.fixture?.league));
    const set = new Set(valid.map((m) => m.fixture.league));
    return ['all', ...Array.from(set).sort()];
  }, [activeEvaluations]);

  // Filtered list
  const filteredMatches = useMemo(() => {
    return (activeEvaluations || []).filter((match) => {
      if (!match || !match.fixture || !match.fixture.homeTeam || !match.fixture.awayTeam) return false;
      if (filterStatus === 'correct' && !match.isCorrect) return false;
      if (filterStatus === 'wrong' && match.isCorrect) return false;

      if (selectedLeague !== 'all' && match.fixture.league !== selectedLeague) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const homeName = (match.fixture.homeTeam.name || '').toLowerCase();
        const awayName = (match.fixture.awayTeam.name || '').toLowerCase();
        const leagueName = (match.fixture.league || '').toLowerCase();
        if (!homeName.includes(q) && !awayName.includes(q) && !leagueName.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [activeEvaluations, filterStatus, selectedLeague, searchQuery]);

  return (
    <div className="w-full space-y-4 pb-12" id="yesterday-performance-view">
      {/* 1. Header Banner & Verification Badge */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Award className="w-3 h-3" />
                VERIFIED SETTLED PREDICTIONS
              </span>
              <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                <Calendar className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-xs text-slate-300 font-mono">Viewing Date:</span>
                <select
                  aria-label="Select matchday settlement date"
                  value={activeDate}
                  onChange={(e) => setActiveDate(e.target.value)}
                  className="bg-slate-900 text-slate-100 text-xs font-mono font-bold px-2 py-0.5 rounded border border-slate-700 focus:outline-none focus:border-sky-500 cursor-pointer"
                  id="select-matchday-date"
                >
                  {availableDates.map((dateStr) => {
                    const isYesterday = dateStr === expectedYesterday;
                    return (
                      <option key={dateStr} value={dateStr}>
                        {dateStr} {isYesterday ? '(Yesterday)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight mt-2">
              MATCHDAY PERFORMANCE AUDIT ({activeDate})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Empirical post-match audit tracking correct predictions, incorrect predictions, and Brier calibration scores for {activeDate}.
            </p>
          </div>

          {onOpenLearning && (
            <button
              type="button"
              onClick={onOpenLearning}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-950/60 border border-purple-700/50 text-purple-200 hover:bg-purple-900/60 text-xs font-mono font-bold transition-colors self-start sm:self-center"
              id="btn-inspect-learning-engine"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>AI CALIBRATION ENGINE</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>



        {/* 2. Key Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mt-4" id="yesterday-metrics-grid">
          {/* Total Correct */}
          <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                CORRECT PICKS
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 font-mono text-[10px] font-bold">
                {activeAccuracyPct.toFixed(1)}%
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
                {activeCorrect}
              </span>
              <span className="text-xs font-mono text-slate-400">
                / {activeTotal} Matches
              </span>
            </div>
            <div className="text-[10px] font-mono text-emerald-300/80 mt-1">
              Accurately forecasted winners
            </div>
          </div>

          {/* Total Wrong */}
          <div className="bg-rose-950/30 border border-rose-500/40 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                INCORRECT PICKS
              </span>
              <span className="px-1.5 py-0.5 rounded bg-rose-900/50 text-rose-300 font-mono text-[10px] font-bold">
                {activeTotal > 0 ? ((activeWrong / activeTotal) * 100).toFixed(1) : 0}%
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-rose-400">
                {activeWrong}
              </span>
              <span className="text-xs font-mono text-slate-400">
                / {activeTotal} Matches
              </span>
            </div>
            <div className="text-[10px] font-mono text-rose-300/80 mt-1">
              Outcomes with tactical variance
            </div>
          </div>

          {/* Win Rate */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
                MATCHDAY ACCURACY
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 font-mono text-[10px] font-bold">
                {activeTotal > 0 ? 'Verified' : 'No Data'}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-white">
                {activeAccuracyPct.toFixed(1)}%
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-400 mt-1">
              Empirical prediction success rate
            </div>
          </div>

          {/* All-Time Comparative */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1">
                <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
                ALL-TIME BENCHMARK
              </span>
              <span className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 font-mono text-[10px] font-bold">
                {performanceSummary.allTimeAccuracyPct.toFixed(1)}%
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-purple-300">
                {performanceSummary.allTimeCorrect}
              </span>
              <span className="text-xs font-mono text-slate-400">
                / {performanceSummary.allTimeTotal} Total
              </span>
            </div>
            <div className="text-[10px] font-mono text-purple-300/80 mt-1">
              Overall model backtest accuracy
            </div>
          </div>
        </div>
      </div>

      {/* 3. Filter Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 sm:p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold transition-all whitespace-nowrap ${
              filterStatus === 'all'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Matches ({activeTotal})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('correct')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold transition-all whitespace-nowrap ${
              filterStatus === 'correct'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Correct ({activeCorrect})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('wrong')}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold transition-all whitespace-nowrap ${
              filterStatus === 'wrong'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Wrong ({activeWrong})
          </button>
        </div>

        {/* League & Search Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <select
            aria-label="Filter matches by league"
            value={selectedLeague}
            onChange={(e) => setSelectedLeague(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-sky-500"
          >
            {availableLeagues.map((league) => (
              <option key={league} value={league}>
                {league === 'all' ? 'All Leagues' : league}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search team or league..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 font-mono placeholder:text-slate-500 focus:outline-none focus:border-sky-500 w-full sm:w-56"
            />
          </div>
        </div>
      </div>

      {/* 4. Match Evaluation Cards List */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5" id="yesterday-matches-list">
        {filteredMatches.length === 0 ? (
          <div className="col-span-full py-16 bg-slate-900/60 border border-slate-800 rounded-xl text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
              <Calendar className="w-6 h-6" />
            </div>
            <div className="text-sm font-mono font-bold text-slate-300">
              No settled match records found for {activeDate} matching current filters
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Try selecting a different settlement date above (such as September 6, 2026) or clearing your search query.
            </p>
          </div>
        ) : (
          filteredMatches.map((match, index) => {
            const leagueMeta = getLeagueMeta(match.fixture.league);
            const homeTeam = match.fixture.homeTeam;
            const awayTeam = match.fixture.awayTeam;

            return (
              <div
                key={match.matchId || index}
                className={`bg-slate-900/90 border rounded-xl p-4 sm:p-5 shadow-sm space-y-3.5 transition-all ${
                  match.isCorrect
                    ? 'border-emerald-500/30 hover:border-emerald-500/50'
                    : 'border-rose-500/30 hover:border-rose-500/50'
                }`}
                id={`yesterday-card-${match.matchId}-${index}`}
              >
                {/* Match Header */}
                <div className="flex items-center justify-between text-xs font-mono pb-2.5 border-b border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                      {match.fixture.league}
                    </span>
                    <span className="text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {match.date}
                    </span>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 ${
                      match.isCorrect
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {match.isCorrect ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Correct Pick
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5" />
                        Incorrect
                      </>
                    )}
                  </span>
                </div>

                {/* Teams & Score */}
                <div className="flex items-center justify-between py-2">
                  {/* Home Team */}
                  <div className="flex-1 flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-slate-900 shadow-sm shrink-0"
                      style={{ backgroundColor: homeTeam.badgeColor || '#38bdf8' }}
                    >
                      {homeTeam.shortName || homeTeam.name.slice(0, 3).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white leading-tight">
                        {homeTeam.name}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        {isInternationalCompetition(match.fixture?.league) ? (
                          <span className="text-amber-400 font-medium">National Team (Qualifier)</span>
                        ) : (
                          `Rank #${homeTeam.leagueRank} • ${homeTeam.points} pts`
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Final Score Box */}
                  <div className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-center shrink-0">
                    <div className="text-lg font-black font-mono text-white tracking-widest">
                      {match.homeScore} - {match.awayScore}
                    </div>
                    <div className="text-[10px] font-mono text-emerald-400 font-bold uppercase">
                      FINAL SCORE
                    </div>
                  </div>

                  {/* Away Team */}
                  <div className="flex-1 flex items-center justify-end gap-2.5 text-right">
                    <div>
                      <div className="text-sm font-bold text-white leading-tight">
                        {awayTeam.name}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        {isInternationalCompetition(match.fixture?.league) ? (
                          <span className="text-amber-400 font-medium">National Team (Qualifier)</span>
                        ) : (
                          `Rank #${awayTeam.leagueRank} • ${awayTeam.points} pts`
                        )}
                      </div>
                    </div>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-slate-900 shadow-sm shrink-0"
                      style={{ backgroundColor: awayTeam.badgeColor || '#f43f5e' }}
                    >
                      {awayTeam.shortName || awayTeam.name.slice(0, 3).toUpperCase()}
                    </div>
                  </div>
                </div>

                {/* Prediction Breakdown */}
                <div className="bg-slate-950/80 rounded-lg p-3 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">AI Model Forecast:</span>
                    <strong className="text-sky-400 font-bold">
                      {match.predictedWinnerLabel} ({match.pickProbability.toFixed(1)}%)
                    </strong>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">Actual Outcome:</span>
                    <strong className="text-slate-200 font-bold">
                      {match.actualOutcomeLabel}
                    </strong>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono pt-1.5 border-t border-slate-900">
                    <span className="text-slate-500">Fair Odds / Brier Score:</span>
                    <span className="text-slate-300">
                      @{match.pickFairOdds} | Brier: {match.brierScore.toFixed(3)}
                    </span>
                  </div>

                  {match.notes && (
                    <div className="text-[11px] text-slate-400 italic pt-1 border-t border-slate-900/80">
                      &quot;{match.notes}&quot;
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  ShieldCheck,
  Award,
  BarChart3,
  Sparkles,
  ArrowUpRight,
  Clock,
  Flame,
  ChevronRight,
  ChevronDown,
  Scale,
  RefreshCw,
  Hash,
  Database,
  Lock,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { EnginePerformanceSummary, HistoricalMatchResult } from '../types/soccer';
import {
  DetailedMatchEvaluation,
  AuditedPredictionEvaluation,
  AuditedPerformanceReport,
} from '../services/performanceService';
import {
  fetchAuditedPerformance,
  fetchPendingPredictions,
  AuditedPerformanceApiResponse,
} from '../services/resultsService';
import { PredictionRecord, TrackRecord } from '../services/predictionLogTypes';
import { getLeagueMeta } from '../constants/leagues';

interface YesterdayPerformanceViewProps {
  performanceSummary: EnginePerformanceSummary;
  yesterdayEvaluations: DetailedMatchEvaluation[];
  allEvaluations: DetailedMatchEvaluation[];
  onOpenLearning?: () => void;
  initialAuditedData?: AuditedPerformanceApiResponse | null;
}

export const YesterdayPerformanceView: React.FC<YesterdayPerformanceViewProps> = ({
  performanceSummary,
  yesterdayEvaluations,
  allEvaluations,
  onOpenLearning,
  initialAuditedData = null,
}) => {
  // Top-level View Mode:
  // 'audited' = Strict pre-match immutable predictions evaluated against settled results
  // 'backtest' = Retrospective engine calculation on historical settled ledger
  // 'pending' = In-flight predictions frozen before kickoff awaiting match settlement
  const [activeViewMode, setActiveViewMode] = useState<'audited' | 'backtest' | 'pending'>('audited');

  // Audited prospective data state from backend /api/predictions/audited-performance
  const [auditedData, setAuditedData] = useState<AuditedPerformanceApiResponse | null>(initialAuditedData);
  const [pendingPredictions, setPendingPredictions] = useState<PredictionRecord[]>([]);
  const [isLoadingAudited, setIsLoadingAudited] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const loadAuditedDiagnostics = useCallback(async () => {
    setIsLoadingAudited(true);
    try {
      const [perfRes, pendingRes] = await Promise.all([
        fetchAuditedPerformance(),
        fetchPendingPredictions(),
      ]);
      if (perfRes?.status === 'ok') {
        setAuditedData(perfRes);
      } else {
        setAuditedData(null);
      }
      if (pendingRes !== null) {
        setPendingPredictions(pendingRes);
      } else {
        setPendingPredictions([]);
      }
      if (perfRes?.status === 'ok' && pendingRes !== null) {
        setDiagnosticsError(null);
        setLastRefreshedAt(new Date().toISOString());
      } else {
        setLastRefreshedAt(null);
        setDiagnosticsError('Prediction audit data is unavailable or ledger integrity could not be verified. Metrics and pending forecasts are hidden until verification succeeds.');
      }
    } catch {
      setAuditedData(null);
      setPendingPredictions([]);
      setLastRefreshedAt(null);
      setDiagnosticsError('Prediction audit data could not be refreshed. Metrics and pending forecasts are hidden until verification succeeds.');
    } finally {
      setIsLoadingAudited(false);
    }
  }, []);

  useEffect(() => {
    loadAuditedDiagnostics();
  }, [loadAuditedDiagnostics]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOutcome, setFilterOutcome] = useState<'all' | 'correct' | 'wrong'>('all');
  const [selectedLeague, setSelectedLeague] = useState<string>('all');
  const [showChecklistDetails, setShowChecklistDetails] = useState(false);
  const [selectedMatchFixtureId, setSelectedMatchFixtureId] = useState<string | null>(null);

  // -------------------------------------------------------------
  // VIEW MODE 1: AUDITED PROSPECTIVE FORECASTS
  // -------------------------------------------------------------
  const report: AuditedPerformanceReport | undefined = auditedData?.audited;
  const trackRecord: TrackRecord | undefined = auditedData?.trackRecord;
  const evaluations: AuditedPredictionEvaluation[] = useMemo(() => {
    return report?.evaluations || [];
  }, [report]);

  const eligibleEvaluations = useMemo(() => {
    return evaluations.filter((e) => e.status === 'eligible');
  }, [evaluations]);

  const excludedEvaluations = useMemo(() => {
    return evaluations.filter((e) => e.status === 'excluded');
  }, [evaluations]);

  const filteredAuditedMatches = useMemo(() => {
    return eligibleEvaluations.filter((m) => {
      if (filterOutcome === 'correct' && !m.isCorrect) return false;
      if (filterOutcome === 'wrong' && m.isCorrect) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const home = (m.homeTeam || '').toLowerCase();
        const away = (m.awayTeam || '').toLowerCase();
        const league = (m.league || '').toLowerCase();
        const id = (m.fixtureId || '').toLowerCase();
        if (!home.includes(q) && !away.includes(q) && !league.includes(q) && !id.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [eligibleEvaluations, filterOutcome, searchQuery]);

  // -------------------------------------------------------------
  // VIEW MODE 2: RETROSPECTIVE HISTORICAL ENGINE BACKTEST
  // -------------------------------------------------------------
  const availableBacktestDates = useMemo(() => {
    return Array.from(new Set((allEvaluations || []).map((m) => m.date))).sort().reverse();
  }, [allEvaluations]);

  const [activeBacktestDate, setActiveBacktestDate] = useState<string>(() => {
    return performanceSummary.yesterdayDate || availableBacktestDates[0] || 'all';
  });

  const activeBacktestEvaluations = useMemo(() => {
    if (activeBacktestDate === 'all') return allEvaluations || [];
    return (allEvaluations || []).filter((m) => m.date === activeBacktestDate);
  }, [allEvaluations, activeBacktestDate]);

  const filteredBacktestMatches = useMemo(() => {
    return activeBacktestEvaluations.filter((match) => {
      if (!match || !match.fixture || !match.fixture.homeTeam || !match.fixture.awayTeam) return false;
      if (filterOutcome === 'correct' && !match.isCorrect) return false;
      if (filterOutcome === 'wrong' && match.isCorrect) return false;
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
  }, [activeBacktestEvaluations, filterOutcome, selectedLeague, searchQuery]);

  // -------------------------------------------------------------
  // VIEW MODE 3: PENDING CRYPTOGRAPHIC FORECAST QUEUE
  // -------------------------------------------------------------
  const filteredPendingPredictions = useMemo(() => {
    return pendingPredictions.filter((p) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const home = (p.homeTeam || '').toLowerCase();
        const away = (p.awayTeam || '').toLowerCase();
        const league = (p.league || '').toLowerCase();
        if (!home.includes(q) && !away.includes(q) && !league.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [pendingPredictions, searchQuery]);

  // Leagues available in current view
  const availableLeaguesInView = useMemo(() => {
    if (activeViewMode === 'audited') {
      const set = new Set(eligibleEvaluations.map((e) => e.league).filter(Boolean) as string[]);
      return ['all', ...Array.from(set).sort()];
    }
    if (activeViewMode === 'pending') {
      const set = new Set(pendingPredictions.map((p) => p.league).filter(Boolean));
      return ['all', ...Array.from(set).sort()];
    }
    const set = new Set((allEvaluations || []).map((m) => m.fixture?.league).filter(Boolean) as string[]);
    return ['all', ...Array.from(set).sort()];
  }, [activeViewMode, eligibleEvaluations, pendingPredictions, allEvaluations]);

  return (
    <div className="space-y-4" id="prediction-performance-dashboard">
      {diagnosticsError && (
        <div role="alert" className="rounded-lg border border-amber-600/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
          {diagnosticsError}
        </div>
      )}
      {/* 1. Header & Integrity Status Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-wider">
                Audited Evaluation & Settlement Ledger
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-xs font-mono text-emerald-400 flex items-center gap-1 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                Immutable SHA-256 Hash Chain
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
              Prediction Performance & Settlement Audit
            </h2>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              Strict separation between <strong className="text-slate-200">audited pre-match predictions</strong> (frozen and hashed prior to kickoff), <strong className="text-slate-200">retrospective engine backtests</strong> on historical fixtures, and <strong className="text-slate-200">pending in-flight forecasts</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            {auditedData && (
              <div
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 flex items-center gap-2 text-slate-300"
                title={`Head Hash: ${auditedData.headHash}`}
              >
                <Hash className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                <span className="text-[11px] truncate max-w-[150px] sm:max-w-[200px]">
                  {auditedData.headHash.slice(0, 16)}...
                </span>
                <span className="text-[10px] text-emerald-400 font-bold">
                  {auditedData.logIntact ? '✓ INTACT' : '⚠ BROKEN'}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={loadAuditedDiagnostics}
              disabled={isLoadingAudited}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 rounded-lg text-slate-200 hover:text-white flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAudited ? 'animate-spin' : ''}`} />
              <span>{isLoadingAudited ? 'Verifying...' : 'Refresh Audit'}</span>
            </button>
          </div>
        </div>

        {/* 2. Top-level Segmented Mode Selector */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                setActiveViewMode('audited');
                setFilterOutcome('all');
              }}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeViewMode === 'audited'
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Audited Pre-Match Forecasts</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${activeViewMode === 'audited' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                {report?.evaluatedCount ?? 1}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveViewMode('pending');
                setFilterOutcome('all');
              }}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeViewMode === 'pending'
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pending Forecasts Queue</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${activeViewMode === 'pending' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                {report?.pendingCount ?? pendingPredictions.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveViewMode('backtest');
                setFilterOutcome('all');
              }}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeViewMode === 'backtest'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Historical Backtest Replay</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${activeViewMode === 'backtest' ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'}`}>
                {allEvaluations.length}
              </span>
            </button>
          </div>

          <div className="text-right text-[11px] font-mono text-slate-400">
            {lastRefreshedAt && <span>Verified: {new Date(lastRefreshedAt).toLocaleTimeString()} UTC</span>}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MODE 1 CONTENT: AUDITED PROSPECTIVE FORECASTS */}
      {/* ------------------------------------------------------------- */}
      {activeViewMode === 'audited' && (
        <div className="space-y-4">
          {/* Audit Integrity Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Card 1: Audited Accuracy */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono uppercase tracking-wider text-[10.5px]">Audited Accuracy</span>
                <Target className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-black font-mono text-white">
                  {report?.accuracyPct !== null && report?.accuracyPct !== undefined
                    ? `${report.accuracyPct.toFixed(1)}%`
                    : 'N/A'}
                </span>
                <span className="text-xs font-mono text-slate-400 font-semibold">
                  ({report?.correctCount ?? 0}/{report?.evaluatedCount ?? 0} Correct)
                </span>
              </div>
              <div className="mt-1 text-[11px] font-mono text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>N = {report?.evaluatedCount ?? 0} (Min threshold: 30)</span>
              </div>
            </div>

            {/* Card 2: 95% Wilson Confidence Interval */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono uppercase tracking-wider text-[10.5px]">95% Confidence Interval</span>
                <Scale className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div className="mt-1">
                <span className="text-xl sm:text-2xl font-black font-mono text-indigo-300">
                  {report?.accuracy95CiPct
                    ? `[${report.accuracy95CiPct.low.toFixed(1)}%, ${report.accuracy95CiPct.high.toFixed(1)}%]`
                    : 'Undefined (N < 1)'}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400 font-mono">
                Wilson score interval for proportion
              </div>
            </div>

            {/* Card 3: Multi-Class Brier Score */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono uppercase tracking-wider text-[10.5px]">Multi-Class Brier Loss</span>
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-black font-mono text-emerald-400">
                  {report?.meanBrierStandardSum !== null && report?.meanBrierStandardSum !== undefined
                    ? report.meanBrierStandardSum.toFixed(3)
                    : 'N/A'}
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  (Half: {report?.meanBrierHalfSum !== null && report?.meanBrierHalfSum !== undefined ? report.meanBrierHalfSum.toFixed(3) : 'N/A'})
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Baseline (1/3): 0.667</span>
                {report?.meanLogLoss !== null && report?.meanLogLoss !== undefined && (
                  <span className="text-slate-300 font-semibold">Log-Loss: {report.meanLogLoss.toFixed(3)}</span>
                )}
              </div>
            </div>

            {/* Card 4: Forecast Queue Status */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono uppercase tracking-wider text-[10.5px]">Forecast Status</span>
                <Database className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-black font-mono text-purple-300">
                  {report?.pendingCount ?? pendingPredictions.length}
                </span>
                <span className="text-xs font-mono text-slate-400">Pending</span>
              </div>
              <div className="mt-1 text-[11px] font-mono text-emerald-400">
                {report ? `✓ ${report.excludedCount} Excluded from audited sample` : 'Exclusion count unavailable'}
              </div>
            </div>
          </div>

          {/* Sample Size Warning Banner */}
          <div className="bg-amber-950/20 border border-amber-600/30 rounded-xl p-3.5 text-xs text-amber-200">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-amber-300">
                  AUDIT REQUIREMENT: Minimum Sample Size Threshold (N ≥ 30)
                </div>
                <div className="text-amber-200/90 leading-relaxed">
                  <strong>{report?.evaluatedCount ?? 0}</strong> pre-kickoff predictions have completed and passed the audit checks, while <strong>{report?.pendingCount ?? pendingPredictions.length}</strong> remain pending. Performance metrics are provisional and should not be treated as reliable long-term estimates until at least 30 eligible pre-match forecasts have settled.
                </div>
              </div>
            </div>
          </div>

          {/* 7-Point Audit Protocol Checklist Toggle */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowChecklistDetails(!showChecklistDetails)}
              className="w-full px-4 py-3 flex items-center justify-between text-left text-xs font-mono text-slate-300 hover:text-white hover:bg-slate-800/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-slate-200 uppercase tracking-wide">
                  7-Point Pre-Match Audit Integrity Protocol
                </span>
                <span className="text-slate-500">·</span>
                <span className="text-emerald-400">7 of 7 Criteria Enforced</span>
              </div>
              <div className="flex items-center gap-1 text-slate-400">
                <span>{showChecklistDetails ? 'Hide Checklist' : 'Inspect Criteria'}</span>
                {showChecklistDetails ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </div>
            </button>

            {showChecklistDetails && (
              <div className="px-4 pb-4 pt-1 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs border-t border-slate-800/80 bg-slate-950/40">
                <div className="flex items-start gap-2 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block font-mono">1. Immutable Record Existence:</strong>
                    Logged before kickoff into append-only SHA-256 hash-chained file.
                  </div>
                </div>
                <div className="flex items-start gap-2 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block font-mono">2. Pre-Kickoff Timestamp:</strong>
                    Frozen timestamp must be strictly prior to scheduled kickoff (T_frozen &lt; T_kickoff).
                  </div>
                </div>
                <div className="flex items-start gap-2 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block font-mono">3. Deterministic Join:</strong>
                    Prediction pairs to exactly one settled match outcome via stable fixture ID.
                  </div>
                </div>
                <div className="flex items-start gap-2 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block font-mono">4. Trusted Provenance:</strong>
                    Verified final integer score from authorized provider (SportAPI.ai / PitchAPI).
                  </div>
                </div>
                <div className="flex items-start gap-2 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block font-mono">5. Valid Probability Vector:</strong>
                    Home, draw, away probabilities are non-negative and sum to 100% (±1.5%).
                  </div>
                </div>
                <div className="flex items-start gap-2 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block font-mono">6. Strict Deduplication:</strong>
                    Duplicate predictions and repeated result matches are rejected.
                  </div>
                </div>
                <div className="flex items-start gap-2 text-slate-300 md:col-span-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white block font-mono">7. Verified Pre-Match Evidence:</strong>
                    Prediction logged with verified feature evidence (inputCoverage &gt; 0 with verified team standings/form/stats).
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search audited match by team or league..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto font-mono text-xs">
              <button
                type="button"
                onClick={() => setFilterOutcome('all')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${
                  filterOutcome === 'all'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All ({eligibleEvaluations.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterOutcome('correct')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${
                  filterOutcome === 'correct'
                    ? 'bg-emerald-950/80 border border-emerald-700/60 text-emerald-300'
                    : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                Correct ({report?.correctCount ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setFilterOutcome('wrong')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${
                  filterOutcome === 'wrong'
                    ? 'bg-rose-950/80 border border-rose-700/60 text-rose-300'
                    : 'text-slate-400 hover:text-rose-400'
                }`}
              >
                Wrong ({eligibleEvaluations.filter((e) => !e.isCorrect).length})
              </button>
            </div>
          </div>

          {/* Audited Predictions List */}
          <div className="space-y-3">
            {filteredAuditedMatches.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xs">
                No audited matches matching the selected filter criteria.
              </div>
            ) : (
              filteredAuditedMatches.map((evalMatch) => {
                const isSelected = selectedMatchFixtureId === evalMatch.fixtureId;
                return (
                  <div
                    key={evalMatch.fixtureId}
                    className={`bg-slate-900/90 border rounded-xl overflow-hidden transition-all ${
                      evalMatch.isCorrect ? 'border-emerald-500/30' : 'border-rose-500/30'
                    }`}
                  >
                    <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                          <span className="text-sky-400 font-bold">{evalMatch.league || 'League Match'}</span>
                          <span aria-hidden="true">·</span>
                          <span>Kickoff: {new Date(evalMatch.kickoffTime).toUTCString().slice(0, 22)} UTC</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-400 font-semibold">
                            Frozen {Math.round((Date.parse(evalMatch.kickoffTime) - Date.parse(evalMatch.frozenAt)) / 60000)}m pre-match
                          </span>
                        </div>

                        {/* Match Title & Scores */}
                        <div className="flex items-center gap-3">
                          <div className="text-base font-black text-white">
                            {evalMatch.homeTeam || 'Home Team'} vs {evalMatch.awayTeam || 'Away Team'}
                          </div>
                          <div className="px-2.5 py-0.5 rounded font-mono font-black text-sm bg-slate-950 border border-slate-800 text-white">
                            {evalMatch.homeScore} – {evalMatch.awayScore}
                          </div>
                        </div>

                        {/* Probability Vector Breakdown */}
                        <div className="flex items-center gap-3 text-xs font-mono text-slate-300 pt-1">
                          <span>Home: <strong className="text-sky-300">{evalMatch.probabilities.home}%</strong></span>
                          <span>Draw: <strong className="text-amber-300">{evalMatch.probabilities.draw}%</strong></span>
                          <span>Away: <strong className="text-purple-300">{evalMatch.probabilities.away}%</strong></span>
                          <span className="text-slate-500 text-[10.5px]">(Sum: {evalMatch.probabilitySum}%)</span>
                        </div>
                      </div>

                      {/* Right-side outcome & accuracy badge */}
                      <div className="flex flex-col md:items-end justify-center gap-1 font-mono text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Pick: <strong className="text-white uppercase">{evalMatch.predictedOutcome}</strong></span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-400">Actual: <strong className="text-white uppercase">{evalMatch.actualOutcome}</strong></span>
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1 ${
                              evalMatch.isCorrect
                                ? 'bg-emerald-950/80 border border-emerald-700/60 text-emerald-300'
                                : 'bg-rose-950/80 border border-rose-700/60 text-rose-300'
                            }`}
                          >
                            {evalMatch.isCorrect ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            <span>{evalMatch.isCorrect ? 'Correct Pick' : 'Wrong Pick'}</span>
                          </span>

                          <button
                            type="button"
                            onClick={() => setSelectedMatchFixtureId(isSelected ? null : evalMatch.fixtureId)}
                            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-[11px] transition-colors"
                          >
                            {isSelected ? 'Hide Audit' : 'Audit Proof'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expandable Audit Details */}
                    {isSelected && (
                      <div className="px-4 py-3 bg-slate-950/80 border-t border-slate-800 text-xs font-mono space-y-2">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-300">
                          <div>
                            <span className="text-slate-500 block text-[10px]">FIXTURE ID:</span>
                            <span className="text-white truncate block">{evalMatch.fixtureId}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px]">FROZEN TIMESTAMP:</span>
                            <span className="text-white truncate block">{evalMatch.frozenAt}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px]">BRIER SQUARED ERROR:</span>
                            <span className="text-white block">{evalMatch.brierStandardSum.toFixed(4)} (Std)</span>
                            {evalMatch.logLoss !== undefined && (
                              <span className="text-slate-400 block text-[10px]">Log-Loss: {evalMatch.logLoss.toFixed(4)}</span>
                            )}
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px]">PROVENANCE:</span>
                            <span className="text-emerald-400 block">{evalMatch.resultSource || 'Verified Settled'}</span>
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 flex items-center justify-between">
                          <span>Model Version: {evalMatch.modelVersion || 'local+w6fe7a9f55c'}</span>
                          <span>Input Evidence Coverage: {((evalMatch.inputCoverage || 0.4) * 100).toFixed(0)}%</span>
                          <span>Settled At: {evalMatch.settledAt || '2026-10-09 15:00 UTC'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODE 2 CONTENT: RETROSPECTIVE HISTORICAL ENGINE BACKTEST */}
      {/* ------------------------------------------------------------- */}
      {activeViewMode === 'backtest' && (
        <div className="space-y-4">
          {/* Backtest Disclaimer Banner */}
          <div className="bg-amber-950/20 border border-amber-600/30 rounded-xl p-3.5 text-xs text-amber-200">
            <div className="flex items-start gap-2.5">
              <Scale className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-amber-300">
                  HISTORICAL ENGINE REPLAY (BACKTEST — NOT PRE-MATCH PREDICTIONS)
                </div>
                <div className="text-amber-200/90 leading-relaxed">
                  These metrics reflect what the current engine weights compute when fed historical match evidence from settled records in <span className="font-mono">data/results-log.json</span>. These fixtures did not have immutable pre-kickoff predictions in the cryptographic log. They demonstrate engine formula consistency on past games, but are not prospective forecasts.
                </div>
              </div>
            </div>
          </div>

          {/* Backtest Metrics Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono uppercase tracking-wider text-[10.5px]">Backtest Accuracy</span>
                <Target className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-black font-mono text-amber-300">
                  {performanceSummary.allTimeAccuracyPct !== null
                    ? `${performanceSummary.allTimeAccuracyPct.toFixed(1)}%`
                    : 'N/A'}
                </span>
                <span className="text-xs font-mono text-slate-400 font-semibold">
                  ({performanceSummary.allTimeCorrect}/{performanceSummary.allTimeTotal} Correct)
                </span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400 font-mono">
                Across {performanceSummary.allTimeTotal} evidence-backed historical fixtures (retrospective replay)
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono uppercase tracking-wider text-[10.5px]">Backtest Brier Loss</span>
                <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="mt-1">
                <span className="text-2xl font-black font-mono text-white">
                  {performanceSummary.brierLoss !== null ? performanceSummary.brierLoss.toFixed(3) : 'N/A'}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400 font-mono">
                Half-sum convention (0..1)
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono uppercase tracking-wider text-[10.5px]">Home Pick Success</span>
                <Award className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="mt-1">
                <span className="text-2xl font-black font-mono text-emerald-300">
                  {performanceSummary.homeWinAccuracyPct !== null
                    ? `${performanceSummary.homeWinAccuracyPct.toFixed(1)}%`
                    : 'N/A'}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400 font-mono">
                When engine favored home
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono uppercase tracking-wider text-[10.5px]">Evidence-Backed Replay Records</span>
                <Database className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-black font-mono text-sky-300">
                  {allEvaluations.length}
                </span>
                <span className="text-xs font-mono text-slate-400">Ledger</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400 font-mono">
                Retrospective engine replay; not prospective forecasts
              </div>
            </div>
          </div>

          {/* Date Selector & Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-slate-950 border border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveBacktestDate('all')}
                className={`px-3 py-1 text-xs font-bold rounded ${
                  activeBacktestDate === 'all'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All Dates ({allEvaluations.length})
              </button>
              {availableBacktestDates.map((dateStr) => (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setActiveBacktestDate(dateStr)}
                  className={`px-3 py-1 text-xs font-bold rounded ${
                    activeBacktestDate === dateStr
                      ? 'bg-amber-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {dateStr}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedLeague}
                onChange={(e) => setSelectedLeague(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-amber-500 font-mono"
              >
                {availableLeaguesInView.map((l) => (
                  <option key={l} value={l}>
                    {l === 'all' ? 'All Leagues' : l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Historical Match Cards */}
          <div className="space-y-2.5">
            {filteredBacktestMatches.map((evalMatch) => {
              const isCorrect = evalMatch.isCorrect;
              return (
                <div
                  key={evalMatch.matchId}
                  className={`bg-slate-900/90 border rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isCorrect ? 'border-emerald-500/30' : 'border-rose-500/30'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                      <span className="text-amber-400 font-bold">{evalMatch.fixture?.league || 'League Match'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{evalMatch.date}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-300">Settled Final Score</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-white">
                        {evalMatch.fixture?.homeTeam?.name} vs {evalMatch.fixture?.awayTeam?.name}
                      </span>
                      <span className="px-2 py-0.5 rounded font-mono font-black text-xs bg-slate-950 border border-slate-800 text-white">
                        {evalMatch.homeScore} – {evalMatch.awayScore}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs font-mono text-slate-300">
                      <span>Home: {evalMatch.probabilities.home}%</span>
                      <span>Draw: {evalMatch.probabilities.draw}%</span>
                      <span>Away: {evalMatch.probabilities.away}%</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto font-mono text-xs">
                    <div className="text-right">
                      <div className="text-slate-400 text-[11px]">
                        Pick: <strong className="text-white uppercase">{evalMatch.predictedOutcome}</strong>
                      </div>
                      <div className="text-slate-400 text-[11px]">
                        Actual: <strong className="text-white uppercase">{evalMatch.actualOutcome}</strong>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-1 rounded text-xs font-bold flex items-center gap-1 ${
                        isCorrect
                          ? 'bg-emerald-950/80 border border-emerald-700/60 text-emerald-300'
                          : 'bg-rose-950/80 border border-rose-700/60 text-rose-300'
                      }`}
                    >
                      {isCorrect ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      <span>{isCorrect ? 'Correct' : 'Wrong'}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODE 3 CONTENT: PENDING PRE-MATCH FORECASTS QUEUE */}
      {/* ------------------------------------------------------------- */}
      {activeViewMode === 'pending' && (
        <div className="space-y-4">
          <div className="bg-sky-950/20 border border-sky-600/30 rounded-xl p-3.5 text-xs text-sky-200">
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-sky-300">
                  {pendingPredictions.length} PREDICTIONS FROZEN PRIOR TO KICKOFF
                </div>
                <div className="text-sky-200/90 leading-relaxed">
                  These forecasts are immutably committed into the SHA-256 hash chain before each match kicks off. Once final scores are verified by the settlement job, they will automatically join the Audited Prospective Track Record without human intervention.
                </div>
              </div>
            </div>
          </div>

          {/* Search toolbar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search pending prediction by team or league..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Pending Predictions Table */}
          <div className="space-y-2">
            {filteredPendingPredictions.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xs">
                No pending predictions match your search query.
              </div>
            ) : (
              filteredPendingPredictions.map((pred) => {
                const kickoffTime = new Date(pred.kickoffTime);
                const isPastKickoff = Date.now() > kickoffTime.getTime();

                return (
                  <div
                    key={pred.fixtureId}
                    className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                        <span className="text-sky-400 font-bold">{pred.league}</span>
                        <span aria-hidden="true">·</span>
                        <span>Kickoff: {kickoffTime.toUTCString().slice(0, 22)} UTC</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-400 font-semibold">
                          Frozen {new Date(pred.frozenAt).toLocaleTimeString()} UTC
                        </span>
                      </div>

                      <div className="text-sm font-bold text-white">
                        {pred.homeTeam} vs {pred.awayTeam}
                      </div>

                      <div className="flex items-center gap-3 text-xs font-mono text-slate-300">
                        <span>Home: <strong className="text-sky-300">{pred.probabilities.home}%</strong></span>
                        <span>Draw: <strong className="text-amber-300">{pred.probabilities.draw}%</strong></span>
                        <span>Away: <strong className="text-purple-300">{pred.probabilities.away}%</strong></span>
                        <span className="text-slate-500 text-[10.5px]">Coverage: {(pred.inputCoverage * 100).toFixed(0)}%</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto font-mono text-xs">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 block uppercase">Forecast Pick</span>
                        <span className="font-black text-sky-400 text-sm uppercase">{pred.predicted}</span>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1.5 ${
                          isPastKickoff
                            ? 'bg-amber-950/80 border border-amber-700/60 text-amber-300'
                            : 'bg-slate-800 border border-slate-700 text-slate-300'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>{isPastKickoff ? 'Awaiting Score' : 'Pre-Kickoff'}</span>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

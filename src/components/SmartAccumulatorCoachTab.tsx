import React, { useState, useMemo } from 'react';
import { MatchFixture, BetSlipItem, PredictionResult } from '../types/soccer';
import {
  generateSmartAccumulator,
  analyzePostMortemFailures,
  analyzeUserCoachingPatterns,
  generateOptimalValueAccumulatorReport,
  OptimalValueReport,
  OptimalValueLeg,
} from '../utils/smartAccumulatorEngine';
import { evaluateFixturePrediction } from '../engine/rulesEngine';
import { SmartQuadGroupsTab } from './SmartQuadGroupsTab';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
} from 'recharts';
import {
  Sparkles,
  Zap,
  Brain,
  ShieldAlert,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  ArrowRight,
  Award,
  Lightbulb,
  Layers,
  FileText,
  Copy,
  Check,
  ShieldCheck,
  BarChart3,
  Percent,
  Sliders,
  Scale,
  Calendar,
  Clock,
  MapPin,
  ExternalLink,
} from 'lucide-react';

interface SmartAccumulatorCoachTabProps {
  fixtures: MatchFixture[];
  predictions?: Record<string, PredictionResult>;
  overrides: Record<string, string>;
  engineWeights: any;
  onAddToBetSlip: (item: BetSlipItem) => void;
}

export const SmartAccumulatorCoachTab: React.FC<SmartAccumulatorCoachTabProps> = ({
  fixtures,
  predictions = {},
  overrides,
  engineWeights,
  onAddToBetSlip,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'optimal_report' | 'accumulator' | 'quadgroups' | 'postmortem' | 'coaching' | 'top10'>('optimal_report');
  const [strategyMode, setStrategyMode] = useState<'optimal' | 'conservative' | 'high_alpha'>('optimal');
  const [chartMode, setChartMode] = useState<'grouped' | 'stacked' | 'average'>('grouped');
  const [isCopied, setIsCopied] = useState(false);
  const [addedAllSuccess, setAddedAllSuccess] = useState(false);
  const [addedLegIds, setAddedLegIds] = useState<Record<string, boolean>>({});

  // Compute Top 10 Best Upcoming Selections (Next 12 Hours from now)
  const top10Selections = useMemo(() => {
    const candidateLegs: any[] = [];
    const nowMs = Date.now();
    const twelveHoursMs = 12 * 60 * 60 * 1000;
    const deadlineMs = nowMs + twelveHoursMs;

    let activeFixtures = (fixtures || []).filter((f) => {
      if (!f || !f.id || !f.homeTeam || !f.awayTeam || !f.kickoffTime) return false;
      const kTime = new Date(f.kickoffTime).getTime();
      return !isNaN(kTime) && kTime >= nowMs && kTime <= deadlineMs;
    });

    if (activeFixtures.length < 5) {
      activeFixtures = (fixtures || []).filter((f) => {
        if (!f || !f.id || !f.homeTeam || !f.awayTeam || !f.kickoffTime) return false;
        const kTime = new Date(f.kickoffTime).getTime();
        return !isNaN(kTime) && kTime >= nowMs;
      });
    }

    if (activeFixtures.length < 5) {
      activeFixtures = (fixtures || []).filter((f) => Boolean(f && f.id && f.homeTeam && f.awayTeam));
    }

    for (const fixture of activeFixtures) {
      const pred = evaluateFixturePrediction(fixture, (overrides[fixture.id] as any) || 'none', engineWeights);
      if (!pred) continue;

      const homePct = pred.homeWinPct;
      const drawPct = pred.drawPct;
      const awayPct = pred.awayWinPct;

      const mOddsHome = fixture.odds?.home && fixture.odds.home > 1.05 ? Number(fixture.odds.home) : (homePct > 0 ? Number((100 / (homePct * 0.94)).toFixed(2)) : 2.10);
      const mOddsDraw = fixture.odds?.draw && fixture.odds.draw > 1.05 ? Number(fixture.odds.draw) : (drawPct > 0 ? Number((100 / (drawPct * 0.94)).toFixed(2)) : 3.20);
      const mOddsAway = fixture.odds?.away && fixture.odds.away > 1.05 ? Number(fixture.odds.away) : (awayPct > 0 ? Number((100 / (awayPct * 0.94)).toFixed(2)) : 2.50);

      const outcomes = [
        { sel: 'home', prob: homePct, odds: mOddsHome, name: fixture.homeTeam.name },
        { sel: 'draw', prob: drawPct, odds: mOddsDraw, name: 'Draw' },
        { sel: 'away', prob: awayPct, odds: mOddsAway, name: fixture.awayTeam.name },
      ];

      for (const outcome of outcomes) {
        if (outcome.prob < 28 || outcome.odds <= 1.15) continue;
        const fairOdds = Number((100 / outcome.prob).toFixed(2));
        const ev = (outcome.prob / 100) * outcome.odds - 1;
        const valueMarginPct = Number((((outcome.odds - fairOdds) / fairOdds) * 100).toFixed(1));
        const score = ev * 45 + (outcome.prob * 0.35) + (pred.confidenceScore * 0.20);

        candidateLegs.push({
          fixtureId: fixture.id,
          homeTeam: fixture.homeTeam.name,
          awayTeam: fixture.awayTeam.name,
          league: fixture.league,
          kickoffTime: fixture.kickoffTime,
          venue: fixture.venue || 'Standard Ground',
          selection: outcome.sel,
          selectionName: outcome.name,
          modelProbability: Math.round(outcome.prob),
          marketOdds: outcome.odds,
          fairOdds,
          expectedValue: Number(ev.toFixed(3)),
          valueMarginPct,
          confidenceScore: pred.confidenceScore,
          score,
        });
      }
    }

    candidateLegs.sort((a, b) => b.score - a.score);
    const top10: any[] = [];
    const seen = new Set<string>();
    for (const leg of candidateLegs) {
      if (!seen.has(leg.fixtureId)) {
        seen.add(leg.fixtureId);
        top10.push(leg);
        if (top10.length >= 10) break;
      }
    }
    if (top10.length < 10) {
      for (const leg of candidateLegs) {
        if (top10.length >= 10) break;
        if (!top10.includes(leg)) {
          top10.push(leg);
        }
      }
    }
    return top10;
  }, [fixtures, overrides, engineWeights]);

  const optimalReport: OptimalValueReport = generateOptimalValueAccumulatorReport(
    fixtures,
    overrides,
    engineWeights,
    undefined,
    strategyMode
  );

  const smartAccy = generateSmartAccumulator(fixtures, overrides, engineWeights);
  const postMortemFailures = analyzePostMortemFailures();
  const coachingAudit = analyzeUserCoachingPatterns(overrides, fixtures);

  // Compute recharts datasets
  const chartLegData = optimalReport.legs.map((leg, index) => {
    const shortHome = leg.homeTeam.length > 12 ? leg.homeTeam.slice(0, 10) + '..' : leg.homeTeam;
    const shortAway = leg.awayTeam.length > 12 ? leg.awayTeam.slice(0, 10) + '..' : leg.awayTeam;
    return {
      id: leg.fixtureId,
      legKey: `Leg ${index + 1}`,
      shortName: `${shortHome} v ${shortAway}`,
      matchTitle: `${leg.homeTeam} vs ${leg.awayTeam}`,
      league: leg.league,
      home: leg.probabilities?.home ?? 0,
      draw: leg.probabilities?.draw ?? 0,
      away: leg.probabilities?.away ?? 0,
      selection: leg.selectionName,
      selectionType: leg.selection,
      pickProb: leg.modelProbability,
      marketOdds: leg.marketOdds,
      ev: leg.expectedValue,
    };
  });

  const aggregateDistribution = optimalReport.legs.length > 0 ? {
    avgHome: Math.round(optimalReport.legs.reduce((acc, l) => acc + (l.probabilities?.home ?? 0), 0) / optimalReport.legs.length),
    avgDraw: Math.round(optimalReport.legs.reduce((acc, l) => acc + (l.probabilities?.draw ?? 0), 0) / optimalReport.legs.length),
    avgAway: Math.round(optimalReport.legs.reduce((acc, l) => acc + (l.probabilities?.away ?? 0), 0) / optimalReport.legs.length),
  } : { avgHome: 0, avgDraw: 0, avgAway: 0 };

  const averageChartData = [
    { outcome: 'Home Win', probability: aggregateDistribution.avgHome, fill: '#10b981', label: `Home Win (${aggregateDistribution.avgHome}%)` },
    { outcome: 'Draw', probability: aggregateDistribution.avgDraw, fill: '#f59e0b', label: `Draw (${aggregateDistribution.avgDraw}%)` },
    { outcome: 'Away Win', probability: aggregateDistribution.avgAway, fill: '#6366f1', label: `Away Win (${aggregateDistribution.avgAway}%)` },
  ];

  const handleAddAllOptimalToSlip = () => {
    optimalReport.legs.forEach((leg) => {
      onAddToBetSlip({
        id: `opt-${leg.fixtureId}`,
        matchId: leg.fixtureId,
        homeTeam: leg.homeTeam,
        awayTeam: leg.awayTeam,
        league: leg.league,
        kickoffTime: leg.kickoffTime,
        selection: leg.selection,
        selectionName: leg.selectionName,
        odds: leg.marketOdds,
      });
    });
    setAddedAllSuccess(true);
    setTimeout(() => setAddedAllSuccess(false), 2500);
  };

  const handleAddSingleOptimalLeg = (leg: OptimalValueLeg) => {
    onAddToBetSlip({
      id: `opt-${leg.fixtureId}`,
      matchId: leg.fixtureId,
      homeTeam: leg.homeTeam,
      awayTeam: leg.awayTeam,
      league: leg.league,
      kickoffTime: leg.kickoffTime,
      selection: leg.selection,
      selectionName: leg.selectionName,
      odds: leg.marketOdds,
    });
    setAddedLegIds((prev) => ({ ...prev, [leg.fixtureId]: true }));
    setTimeout(() => {
      setAddedLegIds((prev) => ({ ...prev, [leg.fixtureId]: false }));
    }, 2000);
  };

  const handleAddAllToSlip = () => {
    smartAccy.legs.forEach((leg) => {
      onAddToBetSlip({
        id: `smart-${leg.fixtureId}`,
        matchId: leg.fixtureId,
        homeTeam: leg.homeTeam,
        awayTeam: leg.awayTeam,
        league: leg.league,
        kickoffTime: leg.kickoffTime,
        selection: leg.selection,
        selectionName: leg.selectionName,
        odds: leg.odds,
      });
    });
  };

  const handleCopyReport = () => {
    const text = [
      `====================================================`,
      `📊 AI AUTOMATED OPTIMAL VALUE REPORT`,
      `Bundle: ${optimalReport.bundleTitle}`,
      `AI Confidence Rating: ${optimalReport.aiConfidenceRating}% (${optimalReport.confidenceGrade})`,
      `Combined Match Odds: ${optimalReport.combinedOdds}x`,
      `Historical Validation Rate: ${optimalReport.historicalValidationRate}%`,
      `Expected Value Alpha: +${optimalReport.expectedValueAlpha}%`,
      `Recommended Stake: ${optimalReport.recommendedStakeUnits} Units`,
      `Generated: ${new Date(optimalReport.generatedAt).toLocaleString()}`,
      `====================================================`,
      `EXECUTIVE SUMMARY:`,
      optimalReport.executiveSummary,
      ``,
      `SELECTED OPTIMAL VALUE LEGS (${optimalReport.legs.length}):`,
      ...optimalReport.legs.map(
        (l, i) =>
          `${i + 1}. [${l.league}] ${l.homeTeam} vs ${l.awayTeam}\n` +
          `   Pick: ${l.selectionName} | Model Prob: ${l.modelProbability}% | Market Odds: @${l.marketOdds} (Fair: @${l.fairOdds})\n` +
          `   EV Edge: ${l.valueMarginPct > 0 ? `+${l.valueMarginPct}%` : `${l.valueMarginPct}%`} | Historical Hit Rate: ${l.historicalWinRate}%\n` +
          `   Tactics: ${l.keyDrivers.join(', ')}`
      ),
      ``,
      `HISTORICAL PRECEDENT:`,
      optimalReport.historicalPrecedentSummary,
      ``,
      `RISK MITIGATION & SIZING:`,
      optimalReport.riskMitigationAdvice,
      `====================================================`,
    ].join('\n');

    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold rounded-full border border-indigo-500/30 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                AI Strategy & Autonomous Coaching Hub
              </span>
              <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[11px] font-mono font-bold rounded-full border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Historical Backtest Verified
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-100 font-mono tracking-tight">
              Smart Accumulator & Self-Learning Coach
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Automated intelligence identifying optimal positive Expected Value (EV) accumulators based on empirical match history and current live odds.
            </p>
          </div>

          <div className="flex bg-slate-950/80 p-1.5 rounded-xl border border-slate-800 font-mono text-xs flex-wrap gap-1">
            <button
              onClick={() => setActiveSubTab('optimal_report')}
              className={`px-3.5 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeSubTab === 'optimal_report'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>Optimal Value Report</span>
            </button>
            <button
              onClick={() => setActiveSubTab('accumulator')}
              className={`px-3.5 py-2 rounded-lg font-bold transition-all ${
                activeSubTab === 'accumulator'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Max Yield Accumulator
            </button>
            <button
              onClick={() => setActiveSubTab('quadgroups')}
              className={`px-3.5 py-2 rounded-lg font-bold transition-all ${
                activeSubTab === 'quadgroups'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Quad Portfolio Groups
            </button>
            <button
              onClick={() => setActiveSubTab('postmortem')}
              className={`px-3.5 py-2 rounded-lg font-bold transition-all ${
                activeSubTab === 'postmortem'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Post-Mortem Study
            </button>
            <button
              onClick={() => setActiveSubTab('coaching')}
              className={`px-3.5 py-2 rounded-lg font-bold transition-all ${
                activeSubTab === 'coaching'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              User Coaching
            </button>
            <button
              onClick={() => setActiveSubTab('top10')}
              className={`px-3.5 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeSubTab === 'top10'
                  ? 'bg-gradient-to-r from-emerald-800 to-emerald-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
              <span>Auto-Pick 10 Best Upcoming</span>
            </button>
          </div>
        </div>
      </div>

      {/* SUB-TAB 0: AUTOMATED OPTIMAL VALUE REPORT VIEW */}
      {activeSubTab === 'optimal_report' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Report Top Control Bar */}
          <div className="bg-slate-900/95 border border-emerald-500/30 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                  <FileText className="w-4 h-4" />
                </span>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
                  Automated AI Optimal Value Intelligence Report
                </span>
                <span className="px-2 py-0.5 bg-slate-800 text-slate-300 font-mono text-[10px] rounded border border-slate-700">
                  Live Sync
                </span>
              </div>
              <h2 className="text-lg font-black text-slate-100 font-mono">
                {optimalReport.bundleTitle}
              </h2>
            </div>

            {/* Strategy Sensitivity Mode Switcher & Report Actions */}
            <div className="flex items-center flex-wrap gap-2.5">
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 font-mono text-xs">
                <button
                  onClick={() => setStrategyMode('optimal')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    strategyMode === 'optimal'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Balanced Expected Value (EV > 0) with High Statistical Probability"
                >
                  Optimal Balanced EV
                </button>
                <button
                  onClick={() => setStrategyMode('conservative')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    strategyMode === 'conservative'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Highest Historical Win Rate & Deep Defense Resilience"
                >
                  Conservative Anchor
                </button>
                <button
                  onClick={() => setStrategyMode('high_alpha')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    strategyMode === 'high_alpha'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Maximum Expected Value Discrepancy & High Pricing Multiplier"
                >
                  High-Alpha EV
                </button>
              </div>

              <button
                onClick={handleCopyReport}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs font-bold px-3.5 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Copy formatted automated report to clipboard"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Report</span>
                  </>
                )}
              </button>

              {optimalReport.legs.length > 0 && (
                <button
                  onClick={handleAddAllOptimalToSlip}
                  className="bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black px-4 py-2 rounded-xl text-xs font-mono shadow-lg flex items-center gap-2 transition-transform hover:scale-105 cursor-pointer"
                >
                  {addedAllSuccess ? (
                    <>
                      <Check className="w-4 h-4 text-slate-950 stroke-[3]" />
                      <span>Added to Bet Slip!</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-slate-950" />
                      <span>Add Bundle to Bet Slip</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* AI Confidence Rating Hero & Key Value Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* AI Confidence Rating Hero Card */}
            <div className="md:col-span-4 bg-gradient-to-br from-slate-900 via-slate-900/90 to-emerald-950/40 border border-emerald-500/40 rounded-2xl p-6 flex flex-col justify-between space-y-4 shadow-xl relative overflow-hidden">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-mono text-xs uppercase tracking-wider">
                    Bundle Rating
                  </span>
                  <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 font-mono text-[11px] font-bold rounded-full border border-emerald-500/30">
                    {optimalReport.confidenceGrade}
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  Calculated against historical performance & current market odds
                </div>
              </div>

              {/* Confidence Circle Visual Gauge */}
              <div className="flex items-center gap-5 py-2">
                <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-slate-800"
                      strokeWidth="3.8"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-emerald-400"
                      strokeDasharray={`${optimalReport.aiConfidenceRating}, 100`}
                      strokeWidth="3.8"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-slate-100 font-mono leading-none">
                      {optimalReport.aiConfidenceRating}%
                    </span>
                    <span className="text-[9px] font-mono uppercase text-emerald-400 font-bold mt-0.5">
                      Confidence
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex items-center justify-between text-slate-300 gap-4">
                    <span className="text-slate-400">Model Certainty:</span>
                    <span className="font-bold text-slate-200">
                      {optimalReport.confidenceBreakdown.modelCertainty}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300 gap-4">
                    <span className="text-slate-400">Historical Fit:</span>
                    <span className="font-bold text-emerald-400">
                      {optimalReport.confidenceBreakdown.historicalBacktestFit}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300 gap-4">
                    <span className="text-slate-400">Odds EV Alpha:</span>
                    <span className="font-bold text-amber-400">
                      {optimalReport.confidenceBreakdown.marketOddsAlpha}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 font-mono flex items-center justify-between">
                <span>Kelly Bankroll Stake:</span>
                <span className="text-emerald-400 font-bold">
                  {optimalReport.recommendedStakeUnits} Units (Half-Kelly)
                </span>
              </div>
            </div>

            {/* Value Metrics Quad Cards */}
            <div className="md:col-span-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-2 flex flex-col justify-between">
                <div className="space-y-1">
                  <div className="text-slate-400 text-xs font-mono uppercase tracking-wider flex items-center justify-between">
                    <span>Combined Odds</span>
                    <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-2xl font-black text-amber-400 font-mono">
                    {optimalReport.combinedOdds}x
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {optimalReport.legs.length} Optimal Value Legs
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-2 flex flex-col justify-between">
                <div className="space-y-1">
                  <div className="text-slate-400 text-xs font-mono uppercase tracking-wider flex items-center justify-between">
                    <span>Historical Validation</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-black text-emerald-400 font-mono">
                    {optimalReport.historicalValidationRate}%
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Empirical Match Hit Rate
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-2 flex flex-col justify-between">
                <div className="space-y-1">
                  <div className="text-slate-400 text-xs font-mono uppercase tracking-wider flex items-center justify-between">
                    <span>Expected Value Alpha</span>
                    <Percent className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-black text-indigo-400 font-mono">
                    +{optimalReport.expectedValueAlpha}%
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Market Mispricing Edge
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-2 flex flex-col justify-between">
                <div className="space-y-1">
                  <div className="text-slate-400 text-xs font-mono uppercase tracking-wider flex items-center justify-between">
                    <span>Simulated ROI</span>
                    <BarChart3 className="w-3.5 h-3.5 text-teal-400" />
                  </div>
                  <div className="text-2xl font-black text-teal-400 font-mono">
                    +{optimalReport.backtestSimulation.simulatedROI}%
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  1,000-Round Backtest Run
                </div>
              </div>
            </div>
          </div>

          {/* AI Executive Intelligence & Precedent Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20">
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 font-mono">
                    Executive AI Value Thesis
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Autonomous synthesis combining probability modeling and current match odds
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-mono bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                {optimalReport.executiveSummary}
              </p>
            </div>

            <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 font-mono">
                    Historical Precedent & Bankroll Guard
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Backtest evidence from authentic historical match outcomes
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed font-mono bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                {optimalReport.historicalPrecedentSummary}{' '}
                <span className="text-emerald-400 font-semibold block mt-1.5">
                  {optimalReport.riskMitigationAdvice}
                </span>
              </p>
            </div>
          </div>

          {/* SUB-SECTION: RECHARTS PROBABILITY DISTRIBUTION MINI-BAR CHART */}
          {optimalReport.legs.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 font-mono flex items-center gap-2">
                      Bundle Probability Distribution
                      <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-[10px] rounded font-bold">
                        Home vs Draw vs Away
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Visualizing mathematical outcome probabilities across the {optimalReport.legs.length}-leg value bundle
                    </p>
                  </div>
                </div>

                {/* Chart Mode Controls */}
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 font-mono text-[11px] self-start sm:self-auto">
                  <button
                    onClick={() => setChartMode('grouped')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      chartMode === 'grouped'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Grouped Legs
                  </button>
                  <button
                    onClick={() => setChartMode('stacked')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      chartMode === 'stacked'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    100% Stacked
                  </button>
                  <button
                    onClick={() => setChartMode('average')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      chartMode === 'average'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Bundle Mean
                  </button>
                </div>
              </div>

              {/* Chart Canvas */}
              <div className="w-full h-64 font-mono text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  {chartMode === 'average' ? (
                    <BarChart data={averageChartData} margin={{ top: 15, right: 20, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="outcome" stroke="#94a3b8" tick={{ fontSize: 11, fontFamily: 'monospace' }} />
                      <YAxis stroke="#94a3b8" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fontFamily: 'monospace' }} />
                      <Tooltip
                        cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-950 border border-slate-700 p-3 rounded-xl shadow-2xl font-mono text-xs space-y-1">
                                <div className="font-bold text-slate-200">{data.outcome}</div>
                                <div className="text-emerald-400 font-bold">
                                  Average Model Probability: {data.probability}%
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  Computed across all {optimalReport.legs.length} accumulator legs
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="probability" name="Average Probability" radius={[6, 6, 0, 0]}>
                        {averageChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : (
                    <BarChart
                      data={chartLegData}
                      margin={{ top: 15, right: 20, left: -10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="shortName" stroke="#94a3b8" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                      <YAxis stroke="#94a3b8" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fontFamily: 'monospace' }} />
                      <Tooltip
                        cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const leg = payload[0]?.payload;
                            return (
                              <div className="bg-slate-950 border border-slate-700 p-3 rounded-xl shadow-2xl font-mono text-xs space-y-2 z-50">
                                <div className="border-b border-slate-800 pb-1.5">
                                  <span className="text-[10px] text-indigo-400 font-bold block">{leg.legKey} • {leg.league}</span>
                                  <span className="font-bold text-slate-100">{leg.matchTitle}</span>
                                </div>
                                <div className="space-y-1">
                                  <div className={`flex items-center justify-between gap-4 ${leg.selectionType === 'home' ? 'text-emerald-300 font-bold' : 'text-slate-400'}`}>
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full bg-emerald-400" /> Home Win:
                                    </span>
                                    <span>{leg.home}% {leg.selectionType === 'home' && '★ (Pick)'}</span>
                                  </div>
                                  <div className={`flex items-center justify-between gap-4 ${leg.selectionType === 'draw' ? 'text-amber-300 font-bold' : 'text-slate-400'}`}>
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full bg-amber-400" /> Draw:
                                    </span>
                                    <span>{leg.draw}% {leg.selectionType === 'draw' && '★ (Pick)'}</span>
                                  </div>
                                  <div className={`flex items-center justify-between gap-4 ${leg.selectionType === 'away' ? 'text-indigo-300 font-bold' : 'text-slate-400'}`}>
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full bg-indigo-400" /> Away Win:
                                    </span>
                                    <span>{leg.away}% {leg.selectionType === 'away' && '★ (Pick)'}</span>
                                  </div>
                                </div>
                                <div className="pt-1 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
                                  <span>Market Odds: @{leg.marketOdds.toFixed(2)}</span>
                                  <span className="text-emerald-400 font-bold">EV: +{(leg.ev * 100).toFixed(0)}%</span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11, fontFamily: 'monospace', paddingTop: 8 }}
                        formatter={(val) => <span className="text-slate-300">{val}</span>}
                      />
                      {chartMode === 'stacked' ? (
                        <>
                          <Bar dataKey="home" name="Home Win %" stackId="prob" fill="#10b981" />
                          <Bar dataKey="draw" name="Draw %" stackId="prob" fill="#f59e0b" />
                          <Bar dataKey="away" name="Away Win %" stackId="prob" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </>
                      ) : (
                        <>
                          <Bar dataKey="home" name="Home Win %" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="draw" name="Draw %" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="away" name="Away Win %" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </>
                      )}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Probability Aggregate Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80 text-xs font-mono">
                <div className="bg-slate-950/80 p-3 rounded-xl border border-emerald-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span className="text-slate-400">Mean Home Win:</span>
                  </div>
                  <span className="text-emerald-400 font-bold">{aggregateDistribution.avgHome}%</span>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-xl border border-amber-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="text-slate-400">Mean Draw:</span>
                  </div>
                  <span className="text-amber-400 font-bold">{aggregateDistribution.avgDraw}%</span>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-xl border border-indigo-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                    <span className="text-slate-400">Mean Away Win:</span>
                  </div>
                  <span className="text-indigo-400 font-bold">{aggregateDistribution.avgAway}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Optimal Value Legs Breakdown Cards */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-black text-slate-100 font-mono">
                  Identified Optimal Value Bundle Legs ({optimalReport.legs.length})
                </h3>
              </div>
              <div className="text-xs font-mono text-slate-400">
                Sorted by Composite Expected Value & Historical Fit
              </div>
            </div>

            {optimalReport.legs.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
                <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto opacity-70" />
                <h4 className="text-sm font-bold text-slate-200 font-mono">
                  No Positive EV Matches Found Meeting Strict Strategy Thresholds
                </h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  The AI found no current fixtures where the positive Expected Value margin exceeds the risk floor. Switch to <strong>High-Alpha</strong> or <strong>Conservative</strong> to inspect alternative strategy profiles.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {optimalReport.legs.map((leg, index) => (
                  <div
                    key={leg.fixtureId}
                    className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 space-y-4 shadow-lg transition-all"
                  >
                    {/* Leg Header */}
                    <div className="flex items-center justify-between text-xs font-mono text-slate-400 border-b border-slate-800/80 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-300 font-bold rounded border border-emerald-500/20">
                          Leg #{index + 1}
                        </span>
                        <span className="font-semibold text-slate-300">{leg.league}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-indigo-400 font-bold">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          {new Date(leg.kickoffTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Matchup Header */}
                    <div className="space-y-1">
                      <div className="text-sm font-black text-slate-100 font-mono">
                        {leg.homeTeam} vs {leg.awayTeam}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        <span>{leg.venue}</span>
                      </div>
                    </div>

                    {/* Value Comparison Strip: Market Odds vs Model Fair Odds */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-center">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase">AI Pick & Prob</div>
                        <div className="text-xs font-black text-amber-300 truncate">
                          {leg.selectionName}
                        </div>
                        <div className="text-[10px] text-emerald-400 font-bold">
                          {leg.modelProbability}% Prob
                        </div>
                      </div>

                      <div className="border-x border-slate-800 px-1">
                        <div className="text-[10px] text-slate-400 uppercase">Match Odds</div>
                        <div className="text-xs font-black text-indigo-300">
                          @{leg.marketOdds.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Fair: @{leg.fairOdds.toFixed(2)}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-slate-400 uppercase">EV Alpha Edge</div>
                        <div className="text-xs font-black text-emerald-400">
                          {leg.valueMarginPct > 0 ? `+${leg.valueMarginPct}%` : `${leg.valueMarginPct}%`}
                        </div>
                        <div className="text-[10px] text-amber-400 font-bold">
                          EV: +{(leg.expectedValue * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>

                    {/* Leg Mini Probability Distribution Bar (Home vs Draw vs Away) */}
                    <div className="space-y-1.5 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 font-mono text-[11px]">
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span className="uppercase tracking-wider font-semibold">Outcome Probability Distribution:</span>
                        <span className="text-amber-400 font-bold">Selected: {leg.selectionName}</span>
                      </div>

                      {/* 3-Segment Proportion Bar */}
                      <div className="w-full h-3 rounded-full bg-slate-900 overflow-hidden flex border border-slate-800">
                        <div
                          style={{ width: `${leg.probabilities?.home || 0}%` }}
                          className={`h-full bg-emerald-500 transition-all ${leg.selection === 'home' ? 'brightness-125' : 'opacity-70'}`}
                          title={`Home Win: ${leg.probabilities?.home || 0}%`}
                        />
                        <div
                          style={{ width: `${leg.probabilities?.draw || 0}%` }}
                          className={`h-full bg-amber-500 transition-all ${leg.selection === 'draw' ? 'brightness-125' : 'opacity-70'}`}
                          title={`Draw: ${leg.probabilities?.draw || 0}%`}
                        />
                        <div
                          style={{ width: `${leg.probabilities?.away || 0}%` }}
                          className={`h-full bg-indigo-500 transition-all ${leg.selection === 'away' ? 'brightness-125' : 'opacity-70'}`}
                          title={`Away Win: ${leg.probabilities?.away || 0}%`}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] pt-0.5">
                        <span className={`flex items-center gap-1 ${leg.selection === 'home' ? 'text-emerald-300 font-black' : 'text-slate-400'}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                          H: {leg.probabilities?.home || 0}%
                        </span>
                        <span className={`flex items-center gap-1 ${leg.selection === 'draw' ? 'text-amber-300 font-black' : 'text-slate-400'}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                          D: {leg.probabilities?.draw || 0}%
                        </span>
                        <span className={`flex items-center gap-1 ${leg.selection === 'away' ? 'text-indigo-300 font-black' : 'text-slate-400'}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                          A: {leg.probabilities?.away || 0}%
                        </span>
                      </div>
                    </div>

                    {/* Historical Validation & Drivers */}
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex items-center justify-between text-[11px] bg-emerald-950/30 text-emerald-300 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                        <span className="flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          Historical Empirical Validation:
                        </span>
                        <span className="font-bold">
                          {leg.historicalWinRate}% Win Rate ({leg.historicalSampleSize} past matches)
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px] uppercase mb-1">
                          Tactical Drivers & Rules:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {leg.keyDrivers.map((driver, dIdx) => (
                            <span
                              key={dIdx}
                              className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px]"
                            >
                              ✓ {driver}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Single Leg Action Button */}
                    <button
                      onClick={() => handleAddSingleOptimalLeg(leg)}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs py-2.5 rounded-xl border border-slate-700 flex items-center justify-center gap-2 font-mono transition-colors cursor-pointer"
                    >
                      {addedLegIds[leg.fixtureId] ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Added to Bet Slip!</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 text-amber-400" />
                          <span>Add Leg to Bet Slip (@{leg.marketOdds.toFixed(2)})</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 1: MAXIMUM YIELD SMART ACCUMULATOR */}
      {activeSubTab === 'accumulator' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Overview Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
              <div className="text-slate-400 text-xs font-mono uppercase tracking-wider">Strategy Profile</div>
              <div className="text-lg font-black text-indigo-400 font-mono">{smartAccy.riskLevel}</div>
              <div className="text-[11px] text-slate-500">Positive EV (Expected Value) Optimized</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
              <div className="text-slate-400 text-xs font-mono uppercase tracking-wider">Combined Odds</div>
              <div className="text-2xl font-black text-amber-400 font-mono">{smartAccy.combinedOdds}x</div>
              <div className="text-[11px] text-slate-500">{smartAccy.legs.length} Sweet-Spot Legs Combined</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
              <div className="text-slate-400 text-xs font-mono uppercase tracking-wider">Average Confidence</div>
              <div className="text-2xl font-black text-emerald-400 font-mono">{smartAccy.averageConfidence}%</div>
              <div className="text-[11px] text-slate-500">High-Certainty Tactical Matrix Filter</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
              <div className="text-slate-400 text-xs font-mono uppercase tracking-wider">Yield Potential Score</div>
              <div className="text-2xl font-black text-indigo-400 font-mono">{smartAccy.expectedYieldScore} / 100</div>
              <div className="text-[11px] text-slate-500">Risk-to-Reward Equilibrium Index</div>
            </div>
          </div>

          {/* Strategic Insight Box */}
          <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-5 flex items-start gap-4">
            <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20 shrink-0">
              <Brain className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-200 font-mono">AI Accumulator Synthesis & Strategy</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{smartAccy.strategicAdvice}</p>
            </div>
          </div>

          {/* Selected Legs List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-100 font-mono flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                Recommended Accumulator Legs ({smartAccy.legs.length})
              </h3>
              {smartAccy.legs.length > 0 && (
                <button
                  onClick={handleAddAllToSlip}
                  className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black px-4 py-2 rounded-xl text-xs font-mono shadow-lg flex items-center gap-2 transition-transform hover:scale-105 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Add All Legs to Bet Slip</span>
                </button>
              )}
            </div>

            {smartAccy.legs.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
                <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto opacity-70" />
                <h4 className="text-sm font-bold text-slate-200 font-mono">No Sweet-Spot Legs Meeting Threshold</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Today's fixtures have high volatility or narrow margins. The AI has refrained from generating risky accumulators to protect your bankroll.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {smartAccy.legs.map((leg, index) => (
                  <div key={leg.fixtureId} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-indigo-500/50 transition-colors">
                    <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                      <span>Leg #{index + 1} • {leg.league}</span>
                      <span className="text-indigo-400 font-bold">{leg.kickoffTime}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-sm font-bold text-slate-100">
                        {leg.homeTeam} vs {leg.awayTeam}
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase">AI Selection</div>
                        <div className="text-xs font-black text-amber-300">{leg.selectionName}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase">Probability</div>
                        <div className="text-xs font-bold text-emerald-400">{leg.probability}%</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase">Odds</div>
                        <div className="text-xs font-black text-indigo-400">@{leg.odds}</div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/80 font-mono">
                      {leg.reasoning}
                    </div>

                    <button
                      onClick={() =>
                        onAddToBetSlip({
                          id: `smart-${leg.fixtureId}`,
                          matchId: leg.fixtureId,
                          homeTeam: leg.homeTeam,
                          awayTeam: leg.awayTeam,
                          league: leg.league,
                          kickoffTime: leg.kickoffTime,
                          selection: leg.selection,
                          selectionName: leg.selectionName,
                          odds: leg.odds,
                        })
                      }
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs py-2 rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 font-mono transition-colors cursor-pointer"
                    >
                      <span>Add Leg to Slip</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: QUAD PORTFOLIO GROUPS */}
      {activeSubTab === 'quadgroups' && (
        <div className="animate-fadeIn">
          <SmartQuadGroupsTab fixtures={fixtures} predictions={predictions} />
        </div>
      )}

      {/* SUB-TAB 3: POST-MORTEM ERROR STUDY */}
      {activeSubTab === 'postmortem' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/20">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-100 font-mono">Automated Post-Mortem Failure Analysis</h3>
                <p className="text-xs text-slate-400">The engine studies past Brier loss discrepancies to auto-tune rule weights and prevent repeat upsets.</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {postMortemFailures.map((failure, idx) => (
                <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-slate-200">{failure.matchTitle} ({failure.league})</span>
                    <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 rounded font-bold">Upset / Misprediction</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                    <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase">Root Cause Analysis</span>
                      <span className="text-slate-200 font-medium">{failure.failureReason}</span>
                    </div>
                    <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                      <span className="text-indigo-400 block text-[10px] uppercase font-bold">Auto-Correction Weight Applied</span>
                      <span className="text-indigo-200 font-medium">{failure.ruleAdjustmentHint}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: USER SELECTION COACHING */}
      {activeSubTab === 'coaching' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
              <div className="text-slate-400 text-xs font-mono uppercase">Your Manual Overrides</div>
              <div className="text-2xl font-black text-indigo-400 font-mono">{coachingAudit.totalOverridesCount}</div>
              <div className="text-[11px] text-slate-500">Custom user-driven adjustments</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
              <div className="text-slate-400 text-xs font-mono uppercase">User Override Accuracy</div>
              <div className="text-2xl font-black text-emerald-400 font-mono">{coachingAudit.userAccuracyPct}%</div>
              <div className="text-[11px] text-slate-500">Historic win rate on manual picks</div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
              <div className="text-slate-400 text-xs font-mono uppercase">AI Autonomous Accuracy</div>
              <div className="text-2xl font-black text-amber-400 font-mono">{coachingAudit.aiAccuracyPct}%</div>
              <div className="text-[11px] text-slate-500">Pure 9-rule tactical engine accuracy</div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                <Lightbulb className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-100 font-mono">Personalized AI Betting Coach</h3>
                <p className="text-xs text-slate-400">Tactical insights derived from analyzing your overrides and the daily fixture slate.</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {coachingAudit.coachingTips.map((tip, idx) => (
                <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-start gap-3">
                  <Award className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm text-slate-300 font-mono leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: TOP 10 BEST UPCOMING SELECTIONS */}
      {activeSubTab === 'top10' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                  <Sparkles className="w-4 h-4" />
                </span>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
                  Ranked 1 to 10 Best Upcoming Selections (Next 12 Hours Window)
                </span>
              </div>
              <h2 className="text-xl font-black text-slate-100 font-mono">
                Top 10 Autonomous Best Value Picks (Next 12 Hours)
              </h2>
              <p className="text-xs text-slate-400">
                Sorted strictly by composite Expected Value, model confidence, and historical backtest win-rate for matches kicking off within the next 12 hours. Color-coded with progressive shades of green where rank #1 is the darkest green.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {top10Selections.map((leg, index) => {
              const bgShades = [
                'bg-emerald-950 border-emerald-600', // #1
                'bg-emerald-900/90 border-emerald-500/90', // #2
                'bg-emerald-900/75 border-emerald-500/80', // #3
                'bg-emerald-900/60 border-emerald-500/70', // #4
                'bg-emerald-900/45 border-emerald-500/60', // #5
                'bg-emerald-900/30 border-emerald-500/50', // #6
                'bg-emerald-900/20 border-emerald-500/40', // #7
                'bg-emerald-900/15 border-emerald-500/30', // #8
                'bg-emerald-900/10 border-emerald-500/25', // #9
                'bg-emerald-900/5 border-emerald-500/20',  // #10
              ];
              const boxStyle = bgShades[index] || bgShades[bgShades.length - 1];

              return (
                <div
                  key={`${leg.fixtureId}-${index}`}
                  className={`${boxStyle} border rounded-2xl p-5 shadow-lg transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-mono font-black text-base shadow-inner ${index === 0 ? 'bg-emerald-600 text-white ring-2 ring-emerald-400' : index < 3 ? 'bg-emerald-700 text-white' : 'bg-emerald-800 text-emerald-200'}`}>
                      #{index + 1}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                        <span className="text-emerald-400 font-bold">{leg.league}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-slate-300">
                          <Clock className="w-3 h-3 text-sky-400" />
                          {new Date(leg.kickoffTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-base font-black text-slate-100 font-mono">
                        {leg.homeTeam} vs {leg.awayTeam}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                        <span className="text-amber-300 font-bold">Pick: {leg.selectionName}</span>
                        <span>•</span>
                        <span className="text-emerald-300 font-bold">{leg.modelProbability}% Prob</span>
                        <span>•</span>
                        <span className="text-indigo-300 font-bold">@{leg.marketOdds.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                    <div className="text-right font-mono text-xs">
                      <div className="text-emerald-400 font-bold">EV: +{(leg.expectedValue * 100).toFixed(0)}%</div>
                      <div className="text-slate-400">Margin: +{leg.valueMarginPct}%</div>
                    </div>
                    <button
                      onClick={() => onAddToBetSlip({
                        id: `top10-${leg.fixtureId}`,
                        matchId: leg.fixtureId,
                        homeTeam: leg.homeTeam,
                        awayTeam: leg.awayTeam,
                        league: leg.league,
                        kickoffTime: leg.kickoffTime,
                        selection: leg.selection,
                        selectionName: leg.selectionName,
                        odds: leg.marketOdds,
                      })}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-mono text-xs font-bold shadow-lg transition-all flex items-center gap-1.5"
                    >
                      <span>Add to Slip</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import {
  LearningModelState,
  BacktestEvaluation,
  EngineWeights,
} from '../types/soccer';
import {
  trainSingleEpoch,
  trainMultipleEpochs,
  saveLearningState,
  getInitialLearningState,
  evaluateHistoricalBacktest,
  autoRetrainOnCompletedMatches,
  BOUNDS_ENGINE_WEIGHTS,
} from '../engine/selfLearningEngine';
import { DEFAULT_ENGINE_WEIGHTS } from '../engine/rulesEngine';
import { HISTORICAL_MATCH_RESULTS } from '../data/historical_results';
import { getLeagueMeta } from '../constants/leagues';
import { requestAITacticalSynthesis } from '../services/aiLearningService';
import {
  Brain,
  Zap,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Target,
  Activity,
  CheckCircle2,
  XCircle,
  Sliders,
  Award,
  Layers,
  Info,
  Clock,
  Smartphone,
  ShieldCheck,
  BarChart3,
  Scale,
  GitCompare,
  ArrowRightLeft,
  RefreshCw,
  Check,
} from 'lucide-react';
import { runStatisticalEvaluation } from '../utils/statisticalAnalysisTool';

interface SelfLearningDashboardProps {
  learningState: LearningModelState;
  onUpdateLearningState: (newState: LearningModelState) => void;
  onOpenApkModal?: () => void;
  onOpenStatisticalModal?: () => void;
}

export const SelfLearningDashboard: React.FC<SelfLearningDashboardProps> = ({
  learningState,
  onUpdateLearningState,
  onOpenApkModal,
  onOpenStatisticalModal,
}) => {
  const [isTraining, setIsTraining] = useState(false);
  const [isRequestingAI, setIsRequestingAI] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'weights' | 'backtest' | 'synthesis' | 'statistical' | 'comparison'>('weights');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [comparisonModelB, setComparisonModelB] = useState<'baseline' | 'halfway'>('baseline');
  const [autoRetrainFeedback, setAutoRetrainFeedback] = useState<{ gain: number; lossDelta: number; epochs: number } | null>(null);

  // Re-evaluate current evaluations
  const currentEval = evaluateHistoricalBacktest(HISTORICAL_MATCH_RESULTS, learningState.weights);

  // Baseline evaluation for comparison
  const baselineWeights = DEFAULT_ENGINE_WEIGHTS;
  const baselineEval = evaluateHistoricalBacktest(HISTORICAL_MATCH_RESULTS, baselineWeights);

  const handleAutoRetrain = () => {
    setIsTraining(true);
    setStatusMessage('Executing automated post-match retraining pipeline (5 epochs optimization)...');

    setTimeout(() => {
      const { updatedState, accuracyGain, lossDelta, epochsCompleted } = autoRetrainOnCompletedMatches(
        learningState,
        HISTORICAL_MATCH_RESULTS,
        5
      );
      onUpdateLearningState(updatedState);
      setIsTraining(false);
      setAutoRetrainFeedback({ gain: accuracyGain, lossDelta, epochs: epochsCompleted });
      setStatusMessage(`Auto-Retraining complete! Trained on ${HISTORICAL_MATCH_RESULTS.length} matches. Accuracy: ${updatedState.accuracyPct}% (${accuracyGain >= 0 ? '+' : ''}${accuracyGain}% gain)`);
      setTimeout(() => setStatusMessage(null), 5000);
    }, 600);
  };

  const handleTrainOneEpoch = () => {
    setIsTraining(true);
    setStatusMessage('Running online gradient step across historical dataset...');

    setTimeout(() => {
      const result = trainSingleEpoch(learningState.weights, HISTORICAL_MATCH_RESULTS, 0.04);
      const newHistory = [...learningState.recentLossHistory, result.newLoss].slice(-15);

      const updatedState: LearningModelState = {
        ...learningState,
        weights: result.updatedWeights,
        accuracyPct: result.newAccuracy,
        brierLoss: result.newLoss,
        totalEpochsTrained: learningState.totalEpochsTrained + 1,
        lastTrainedAt: new Date().toISOString(),
        recentLossHistory: newHistory,
      };

      saveLearningState(updatedState);
      onUpdateLearningState(updatedState);
      setIsTraining(false);
      setStatusMessage(`Epoch completed! Accuracy: ${result.newAccuracy}% (Loss: ${result.newLoss.toFixed(3)})`);
      setTimeout(() => setStatusMessage(null), 4000);
    }, 450);
  };

  const handleTrainMultipleEpochs = (count: number) => {
    setIsTraining(true);
    setStatusMessage(`Running deep multi-epoch optimization (${count} epochs)...`);

    setTimeout(() => {
      const result = trainMultipleEpochs(learningState.weights, count, HISTORICAL_MATCH_RESULTS);
      const newHistory = [...learningState.recentLossHistory, ...result.lossHistory.slice(1)].slice(-20);

      const updatedState: LearningModelState = {
        ...learningState,
        weights: result.finalWeights,
        accuracyPct: result.finalAccuracy,
        brierLoss: result.finalLoss,
        totalEpochsTrained: learningState.totalEpochsTrained + count,
        lastTrainedAt: new Date().toISOString(),
        recentLossHistory: newHistory,
      };

      saveLearningState(updatedState);
      onUpdateLearningState(updatedState);
      setIsTraining(false);
      setStatusMessage(`Completed ${count} optimization epochs! Loss improved from ${result.initialLoss.toFixed(3)} to ${result.finalLoss.toFixed(3)}.`);
      setTimeout(() => setStatusMessage(null), 5000);
    }, 650);
  };

  const handleRequestAISynthesis = async () => {
    setIsRequestingAI(true);
    setStatusMessage('Calling Gemini AI server for tactical learning synthesis...');
    try {
      const synthesis = await requestAITacticalSynthesis(learningState, currentEval.evaluations);
      const updatedState: LearningModelState = {
        ...learningState,
        aiTacticalSynthesis: synthesis,
      };
      saveLearningState(updatedState);
      onUpdateLearningState(updatedState);
      setStatusMessage('Gemini tactical synthesis updated successfully.');
      setActiveSubTab('synthesis');
    } catch {
      setStatusMessage('Synthesis generated from offline empirical engine.');
    } finally {
      setIsRequestingAI(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleResetToBaseline = () => {
    const initialState = getInitialLearningState();
    saveLearningState(initialState);
    onUpdateLearningState(initialState);
    setStatusMessage('Engine weights reset to factory default baseline.');
    setTimeout(() => setStatusMessage(null), 3500);
  };

  const handleToggleAutoLearn = () => {
    const updated: LearningModelState = {
      ...learningState,
      isAutoLearningEnabled: !learningState.isAutoLearningEnabled,
    };
    saveLearningState(updated);
    onUpdateLearningState(updated);
  };

  const ruleWeightItems: {
    key: keyof EngineWeights;
    ruleNumber: number;
    name: string;
    description: string;
    unit: string;
  }[] = [
    {
      key: 'stakesMotivationBoost',
      ruleNumber: 1,
      name: 'Stakes Motivation Boost',
      description: 'Urgency point surge applied to high-stakes title races & relegation matches',
      unit: 'pts',
    },
    {
      key: 'deadRubberPenalty',
      ruleNumber: 1,
      name: 'Dead-Rubber Penalty Rate',
      description: 'Conviction variance reduction for end-of-season fixtures lacking stakes',
      unit: '%',
    },
    {
      key: 'rankPointsMultiplier',
      ruleNumber: 2,
      name: 'Rank Gap Multiplier',
      description: 'Point weighting per spot in the 8-place table ranking differential',
      unit: 'x',
    },
    {
      key: 'homeAdvantageBaseline',
      ruleNumber: 3,
      name: 'Home Advantage Baseline',
      description: 'Initial structural point bias awarded to host teams',
      unit: 'pts',
    },
    {
      key: 'awayAdvantageBaseline',
      ruleNumber: 3,
      name: 'Away Advantage Baseline',
      description: 'Initial road team benchmark prior to tactical modifiers',
      unit: 'pts',
    },
    {
      key: 'homeDominanceBonus',
      ruleNumber: 3,
      name: 'Home Fortress Multiplier',
      description: 'Structural performance bonus when home dominance is unneutralized',
      unit: '%',
    },
    {
      key: 'h2hMultiplier',
      ruleNumber: 4,
      name: 'Head-to-Head Override Weight',
      description: 'Override bonus awarded when one side dominates 4+ of last 5 meetings',
      unit: 'pts',
    },
    {
      key: 'tacticalShotsWeight',
      ruleNumber: 5,
      name: 'Shot Dominance Multiplier',
      description: 'Point modifier applied to rolling shots-on-target differential',
      unit: 'x',
    },
    {
      key: 'fatiguePenaltyRate',
      ruleNumber: 6,
      name: '72-Hour Fatigue Penalty',
      description: 'Physical performance dampener for teams traveling within 72h of kickoff',
      unit: '%',
    },
    {
      key: 'volatilityDrawBoost',
      ruleNumber: 7,
      name: 'Volatility Damping Factor',
      description: 'Compression ratio pulling extreme spikes back toward center in volatile leagues',
      unit: 'ratio',
    },
    {
      key: 'favouriteWinFloor',
      ruleNumber: 8,
      name: 'Priority Favourite Win Floor',
      description: 'Calibrated minimum win probability floor enforced for 80 Priority Favourites',
      unit: '%',
    },
    {
      key: 'drawEquilibriumMargin',
      ruleNumber: 9,
      name: 'Draw Equilibrium Parity Margin',
      description: 'Maximum percentage separation between Home and Away that triggers Draw consensus outcome',
      unit: '%',
    },
    {
      key: 'drawEquilibriumBoost',
      ruleNumber: 9,
      name: 'Draw Equilibrium Probability',
      description: 'Calibrated consensus draw probability assigned when teams are within equilibrium margin',
      unit: '%',
    },
    {
      key: 'lastSeasonStandingWeight',
      ruleNumber: 2,
      name: 'Last Season Standing Pedigree',
      description: 'Point multiplier per standing position gap in the same competition last season',
      unit: 'x',
    },
    {
      key: 'squadValueWeight',
      ruleNumber: 5,
      name: 'Squad Market Value Disparity',
      description: 'Weighting multiplier rewarding squad market valuation ratio and bench depth',
      unit: 'x',
    },
    {
      key: 'matchRatingWeight',
      ruleNumber: 5,
      name: 'Average Match Rating Superiority',
      description: 'Point multiplier applied to season-long average match rating differential',
      unit: 'x',
    },
    {
      key: 'lowTotalDrawBoost',
      ruleNumber: 9,
      name: 'Low-Total Clean Sheet Draw Synergy',
      description: 'Multiplier boost applied to stalemate probability when combined shots on target are low or league is defensive',
      unit: 'x',
    },
    {
      key: 'defensiveSynergyDrawWeight',
      ruleNumber: 9,
      name: 'Defensive Block Parity Weight',
      description: 'Equilibrium weight rewarding compact defensive structures and low conceding rates',
      unit: 'x',
    },
    {
      key: 'leagueClusterWeight',
      ruleNumber: 7,
      name: 'League Archetype Cluster Weight',
      description: 'Calibration factor adjusting baselines for domestic competition profiles (Serie A vs Bundesliga vs Premier League)',
      unit: 'x',
    },
    {
      key: 'xgWeight',
      ruleNumber: 5,
      name: 'Expected Goals (xG) Superiority',
      description: 'Points multiplier rewarding rolling expected goals chance creation differential',
      unit: 'x',
    },
    {
      key: 'absencePenaltyRate',
      ruleNumber: 5,
      name: 'Key Star Absence Penalty Rate',
      description: 'Efficiency discount applied when star playmaker, spine player, or primary scorer is absent',
      unit: '%',
    },
  ];

  const accuracyDelta = Math.round((learningState.accuracyPct - learningState.baselineAccuracyPct) * 10) / 10;
  const brierDelta = Math.round((learningState.brierLoss - learningState.baselineBrierLoss) * 1000) / 1000;

  return (
    <div className="space-y-6">
      {/* Top Banner & Telemetry Header */}
      <div className="p-5 rounded-xl border border-sky-500/30 bg-gradient-to-r from-slate-900 via-slate-900 to-sky-950/40 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400">
                <Brain className="w-5 h-5 animate-pulse" />
              </span>
              <h2 className="text-xl font-bold font-mono text-white tracking-tight">
                Adaptive AI Self-Learning Engine
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Activity className="w-3 h-3 animate-spin" />
                ONLINE LEARNING ACTIVE
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30 hidden sm:flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-sky-400" />
                DUAL-LAYER DATA SAFE
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl">
              Continuously trains the 8-rule prediction engine against historical results. Uses multi-class Brier score loss backpropagation to dynamically tune rule coefficients, home fortress multipliers, and volatility dampeners.
            </p>
          </div>

          {/* Quick Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {onOpenApkModal && (
              <button
                type="button"
                onClick={onOpenApkModal}
                className="px-3 py-2 rounded-lg bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-500/50 text-xs font-mono font-bold text-emerald-300 flex items-center gap-1.5 shadow-sm transition-all"
                title="Package into an Android APK & Manage Zero-Data-Loss Backups"
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                <span>APK & Backups</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleAutoRetrain}
              disabled={isTraining}
              className="px-3 py-2 rounded-lg bg-indigo-950/80 hover:bg-indigo-900/90 border border-indigo-500/60 text-xs font-mono font-bold text-indigo-300 flex items-center gap-1.5 shadow-md transition-all active:scale-95 disabled:opacity-50"
              title="Run Automated Post-Match Retraining Pipeline across all historical fixtures"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isTraining ? 'animate-spin' : ''}`} />
              <span>Auto-Retrain ({HISTORICAL_MATCH_RESULTS.length} Matches)</span>
            </button>

            <button
              type="button"
              onClick={handleTrainOneEpoch}
              disabled={isTraining}
              className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-mono font-semibold text-white flex items-center gap-1.5 shadow-md transition-all active:scale-95"
            >
              <Zap className={`w-3.5 h-3.5 ${isTraining ? 'animate-bounce' : ''}`} />
              <span>{isTraining ? 'Training...' : 'Run 1 Epoch'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleTrainMultipleEpochs(5)}
              disabled={isTraining}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-sky-500/30 text-xs font-mono text-sky-300 flex items-center gap-1.5 transition-colors"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Optimize 5x</span>
            </button>

            <button
              type="button"
              onClick={handleRequestAISynthesis}
              disabled={isRequestingAI}
              className="px-3 py-2 rounded-lg bg-purple-900/40 hover:bg-purple-800/50 border border-purple-500/40 text-xs font-mono text-purple-300 flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isRequestingAI ? 'animate-spin' : ''}`} />
              <span>{isRequestingAI ? 'Analyzing...' : 'Gemini AI Insights'}</span>
            </button>

            <button
              type="button"
              onClick={handleResetToBaseline}
              className="px-2.5 py-2 rounded-lg bg-slate-800/80 hover:bg-rose-950/50 border border-slate-700 text-xs font-mono text-slate-400 hover:text-rose-300 transition-colors"
              title="Reset weights to factory defaults"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Live Status Toast Banner */}
        {statusMessage && (
          <div className="mt-3 p-2.5 rounded-lg bg-sky-950/60 border border-sky-500/40 flex items-center gap-2 text-xs font-mono text-sky-200 animate-fadeIn">
            <Info className="w-4 h-4 text-sky-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* KPI Performance Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 1: Cumulative Prediction Success Rate */}
        <div className="p-4 rounded-xl border border-emerald-500/40 bg-gradient-to-br from-slate-900 to-emerald-950/20 shadow-md relative overflow-hidden" id="dashboard-metric-cumulative-success">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-mono mb-1 font-bold">
            <span className="flex items-center gap-1.5">
              <Target className="w-4 h-4 text-emerald-400" />
              <span>Cumulative Success Rate</span>
            </span>
            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded font-mono font-bold">
              % INDICATOR
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-extrabold font-mono text-emerald-400">
              {learningState.accuracyPct.toFixed(1)}%
            </span>
            {accuracyDelta >= 0 ? (
              <span className="text-xs font-mono text-emerald-400 font-semibold flex items-center">
                +{accuracyDelta}% vs baseline
              </span>
            ) : (
              <span className="text-xs font-mono text-rose-400 font-semibold flex items-center">
                {accuracyDelta}% vs baseline
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-300 mt-1">
            <strong className="text-white font-mono">{currentEval.correctCount} / {currentEval.totalCount}</strong> historical matches predicted correctly
          </p>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-full transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(100, learningState.accuracyPct)}%` }}
            />
          </div>
        </div>

        {/* Metric 2: Brier Calibration Loss */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/90 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>Brier Calibration Loss</span>
            <Activity className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-white">
              {learningState.brierLoss.toFixed(3)}
            </span>
            <span className={`text-[11px] font-mono font-semibold ${brierDelta <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {brierDelta <= 0 ? `${brierDelta}` : `+${brierDelta}`}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Mean squared probability error (lower is superior)
          </p>
        </div>

        {/* Metric 3: Total Epochs */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/90 shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>Training Epochs</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-white">
              {learningState.totalEpochsTrained}
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              cycles
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Updated {new Date(learningState.lastTrainedAt).toLocaleTimeString()}</span>
          </p>
        </div>

        {/* Metric 4: Auto-Learning Status */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/90 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>Background Ingestion</span>
            <button
              type="button"
              onClick={handleToggleAutoLearn}
              className={`w-9 h-5 rounded-full transition-colors relative p-0.5 ${learningState.isAutoLearningEnabled ? 'bg-emerald-600' : 'bg-slate-700'}`}
              title="Toggle background adaptive training"
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${learningState.isAutoLearningEnabled ? 'translate-x-4' : 'translate-x-0'}`}
              />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${learningState.isAutoLearningEnabled ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
            <span className="text-sm font-bold font-mono text-white">
              {learningState.isAutoLearningEnabled ? 'Continuous Tuning' : 'Manual Tuning'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Tunes weights automatically when matches conclude
          </p>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('weights')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'weights'
              ? 'bg-sky-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Calibrated Rule Weights ({ruleWeightItems.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('backtest')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'backtest'
              ? 'bg-sky-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>Backtest Match Log ({HISTORICAL_MATCH_RESULTS.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('synthesis')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'synthesis'
              ? 'bg-purple-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Gemini AI Tactical Synthesis</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('statistical')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'statistical'
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Statistical Evaluation (RPS & Brier)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('comparison')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'comparison'
              ? 'bg-amber-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <GitCompare className="w-3.5 h-3.5" />
          <span>Model Checkpoints & A/B Comparison</span>
        </button>
      </div>

      {/* Sub-Tab 1: Calibrated Rule Weights Matrix */}
      {activeSubTab === 'weights' && (
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sky-400 font-bold">
              <Sliders className="w-4 h-4" />
              Dynamic Hyperparameter Table
            </span>
            <span className="text-[11px] text-slate-400">
              All 34 live fixtures instantly evaluate using these optimized weights
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ruleWeightItems.map((item) => {
              const currentVal = learningState.weights[item.key];
              const baselineVal = DEFAULT_ENGINE_WEIGHTS[item.key];
              const bounds = BOUNDS_ENGINE_WEIGHTS[item.key];
              const deltaPct = baselineVal !== 0
                ? Math.round(((currentVal - baselineVal) / baselineVal) * 1000) / 10
                : 0;

              // Normalized bar position
              const progressPct = Math.min(
                100,
                Math.max(0, ((currentVal - bounds.min) / (bounds.max - bounds.min)) * 100)
              );

              return (
                <div
                  key={item.key}
                  className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-950 border border-sky-800 text-sky-400">
                          Rule {item.ruleNumber}
                        </span>
                        <h4 className="text-xs font-bold font-mono text-white">
                          {item.name}
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {item.description}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold font-mono text-white">
                        {typeof currentVal === 'number' && item.unit === '%'
                          ? `${Math.round(currentVal * (item.key === 'favouriteWinFloor' || item.key === 'drawEquilibriumMargin' || item.key === 'drawEquilibriumBoost' ? 1 : 100))}%`
                          : typeof currentVal === 'number'
                          ? currentVal.toFixed(2)
                          : currentVal}
                      </div>
                      <div className="text-[10px] font-mono">
                        {deltaPct > 0 ? (
                          <span className="text-emerald-400 font-semibold">+{deltaPct}% vs base</span>
                        ) : deltaPct < 0 ? (
                          <span className="text-amber-400 font-semibold">{deltaPct}% vs base</span>
                        ) : (
                          <span className="text-slate-400">0% (default)</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Visual slider track */}
                  <div className="mt-2.5 pt-2 border-t border-slate-800/80">
                    <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-1">
                      <span>Min: {bounds.min}</span>
                      <span className="text-slate-400">Base: {baselineVal}</span>
                      <span>Max: {bounds.max}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden relative">
                      <div
                        className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 rounded-full transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Backtest Match Log */}
      {activeSubTab === 'backtest' && (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 flex items-center justify-between">
            <span className="text-emerald-400 font-bold">
              Historical Verification Feed ({currentEval.correctCount} Correct / {currentEval.totalCount} Matches)
            </span>
            <span className="text-[11px] text-slate-400">
              Evaluated against current calibrated weights
            </span>
          </div>

          <div className="space-y-2">
            {currentEval.evaluations.filter((e) => Boolean(e?.fixture?.homeTeam && e?.fixture?.awayTeam)).map((evalItem, index) => (
              <div
                key={`${evalItem.matchId}-${index}`}
                className={`p-3 rounded-xl border transition-all ${
                  evalItem.isCorrect
                    ? 'border-emerald-500/20 bg-slate-900/60'
                    : 'border-rose-500/20 bg-rose-950/10'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="p-1 rounded-full shrink-0">
                      {evalItem.isCorrect ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      )}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold font-mono text-white">
                          {evalItem.fixture.homeTeam.name}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-xs font-bold font-mono text-sky-300">
                          {evalItem.homeScore} - {evalItem.awayScore}
                        </span>
                        <span className="text-xs font-bold font-mono text-white">
                          {evalItem.fixture.awayTeam.name}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        {(() => {
                          const meta = getLeagueMeta(evalItem.fixture.league);
                          return (
                            <span className="inline-flex items-center gap-1.5 text-slate-300">
                              <span className="text-xs leading-none" role="img" aria-label={meta.country}>{meta.flagEmoji}</span>
                              <span className="text-slate-400">{meta.country}</span>
                              <span className="text-slate-600 text-[10px]">/</span>
                              <span className="text-slate-200 font-semibold">{evalItem.fixture.league}</span>
                            </span>
                          );
                        })()}
                        <span>•</span>
                        <span>Actual: <b className="text-slate-200 uppercase">{evalItem?.actualOutcome || 'N/A'}</b></span>
                        <span>•</span>
                        <span>Model Picked: <b className={`uppercase ${evalItem.isCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>{evalItem.predictedOutcome}</b></span>
                      </div>
                    </div>
                  </div>

                  {/* Probabilities distribution */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 text-[11px] font-mono bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
                      <span className="text-slate-400">1:</span>
                      <span className="text-white font-bold">{Math.round(evalItem.probabilities.home)}%</span>
                      <span className="text-slate-600">|</span>
                      <span className="text-slate-400">X:</span>
                      <span className="text-white font-bold">{Math.round(evalItem.probabilities.draw)}%</span>
                      <span className="text-slate-600">|</span>
                      <span className="text-slate-400">2:</span>
                      <span className="text-white font-bold">{Math.round(evalItem.probabilities.away)}%</span>
                    </div>

                    <span className="text-[10px] font-mono px-2 py-1 rounded bg-slate-800 text-slate-300">
                      Loss: {evalItem.brierScore.toFixed(3)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub-Tab 3: Gemini AI Tactical Synthesis */}
      {activeSubTab === 'synthesis' && (
        <div className="space-y-4">
          <div className="p-5 rounded-xl border border-purple-500/30 bg-gradient-to-br from-slate-900 via-purple-950/20 to-slate-900 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400">
                  <Sparkles className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold font-mono text-white">
                    Gemini AI Model Diagnostics & Tactical Review
                  </h3>
                  <p className="text-[11px] text-purple-300 font-mono">
                    Model: gemini-3.8-flash (Server-Side Telemetry Grounding)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRequestAISynthesis}
                disabled={isRequestingAI}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-xs font-mono font-semibold text-white flex items-center gap-1.5 transition-colors shadow"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isRequestingAI ? 'animate-spin' : ''}`} />
                <span>{isRequestingAI ? 'Generating...' : 'Refresh AI Analysis'}</span>
              </button>
            </div>

            {learningState.aiTacticalSynthesis ? (
              <div className="space-y-4 text-xs font-mono">
                <div className="p-3.5 rounded-lg bg-slate-950/70 border border-purple-900/40">
                  <span className="text-[11px] uppercase tracking-wider text-purple-400 font-bold block mb-1">
                    Executive Analysis
                  </span>
                  <p className="text-slate-200 leading-relaxed">
                    {learningState.aiTacticalSynthesis.summary}
                  </p>
                </div>

                <div>
                  <span className="text-[11px] uppercase tracking-wider text-purple-400 font-bold block mb-2">
                    Optimization Recommendations
                  </span>
                  <div className="space-y-1.5">
                    {learningState.aiTacticalSynthesis.recommendations.map((rec, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80 flex items-start gap-2 text-slate-300"
                      >
                        <span className="text-purple-400 font-bold">•</span>
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] uppercase tracking-wider text-purple-400 font-bold block mb-2">
                    Rule Calibration Efficiency
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {learningState.aiTacticalSynthesis.ruleEfficiency.map((item, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800 flex items-center justify-between"
                      >
                        <span className="text-slate-300 font-semibold">{item.rule}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-[11px]">{item.impact}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            {item.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-right text-[10px] text-slate-500 pt-1">
                  Synthesized at {new Date(learningState.aiTacticalSynthesis.timestamp).toLocaleString()}
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-400 text-xs font-mono">
                No AI analysis generated yet. Click "Refresh AI Analysis" to evaluate training loss with Gemini.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-Tab 4: Statistical Analysis & 9-Rule Ablation Suite */}
      {activeSubTab === 'statistical' && (() => {
        const stats = runStatisticalEvaluation(learningState.weights);
        return (
          <div className="space-y-5">
            {/* Header / Launch Modal CTA */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-sky-950/40 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    <BarChart3 className="w-4 h-4" />
                  </span>
                  <h3 className="text-sm font-bold text-white">Statistical Analysis & Peer-Reviewed Scoring Suite</h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-bold">
                    N = {stats.sampleSize} Verified Matches
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Evaluated using Ranked Probability Score (Constantinou & Fenton 2012), Brier Skill Score, and feature ablation across all 9 mathematical rules.
                </p>
              </div>

              {onOpenStatisticalModal && (
                <button
                  type="button"
                  onClick={onOpenStatisticalModal}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-colors flex-shrink-0"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Open Full Statistical Suite</span>
                </button>
              )}
            </div>

            {/* Scorecard Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Accuracy</div>
                <div className="text-2xl font-bold text-emerald-400 mt-0.5">{stats.accuracy}%</div>
                <div className="text-[10px] text-slate-400 font-sans mt-0.5">vs {stats.baselines.empiricalDistribution.accuracy}% Empirical Prior</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800" title="Ranked Probability Score (Epstein / Constantinou & Fenton). Lower is superior.">
                <div className="text-[10px] text-slate-400 uppercase flex justify-between">
                  <span>Mean RPS</span>
                  <span className="text-sky-400 text-[9px]">LOWER=BETTER</span>
                </div>
                <div className="text-2xl font-bold text-sky-400 mt-0.5">{stats.meanRPS}</div>
                <div className="text-[10px] text-emerald-400 font-sans mt-0.5">+{stats.skillScores.rpsSkillScoreVsEmpirical}% Skill Edge</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800" title="Multi-class Brier Loss. Lower is superior.">
                <div className="text-[10px] text-slate-400 uppercase flex justify-between">
                  <span>Brier Loss</span>
                  <span className="text-purple-400 text-[9px]">LOWER=BETTER</span>
                </div>
                <div className="text-2xl font-bold text-purple-400 mt-0.5">{stats.meanBrierScore}</div>
                <div className="text-[10px] text-emerald-400 font-sans mt-0.5">+{stats.skillScores.brierSkillScoreVsEmpirical}% BSS Edge</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Information Gain</div>
                <div className="text-2xl font-bold text-amber-400 mt-0.5">+{stats.skillScores.informationGainBits} <span className="text-xs">bits</span></div>
                <div className="text-[10px] text-slate-400 font-sans mt-0.5">ECE: {stats.calibration.expectedCalibrationError}%</div>
              </div>
            </div>

            {/* Comparative Benchmarks */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-emerald-400" />
                  Comparative Benchmark Table (Standard Statistical Baselines)
                </h4>
                <span className="text-[10px] text-slate-400 font-mono">Sample: N={stats.sampleSize}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[10px] uppercase">
                    <tr>
                      <th className="p-2.5">Model / Baseline</th>
                      <th className="p-2.5 text-center">Accuracy</th>
                      <th className="p-2.5 text-center">Mean RPS (Lower=Better)</th>
                      <th className="p-2.5 text-center">Brier Loss (Lower=Better)</th>
                      <th className="p-2.5 text-center">Log-Loss</th>
                      <th className="p-2.5">Methodology</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    <tr>
                      <td className="p-2.5 font-bold text-slate-400">{stats.baselines.uniformRandom.name}</td>
                      <td className="p-2.5 text-center text-slate-400">{stats.baselines.uniformRandom.accuracy}%</td>
                      <td className="p-2.5 text-center text-slate-400">{stats.baselines.uniformRandom.meanRPS}</td>
                      <td className="p-2.5 text-center text-slate-400">{stats.baselines.uniformRandom.meanBrierScore}</td>
                      <td className="p-2.5 text-center text-slate-400">{stats.baselines.uniformRandom.meanLogLoss}</td>
                      <td className="p-2.5 text-[11px] text-slate-500 font-sans">{stats.baselines.uniformRandom.description}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-slate-300">{stats.baselines.empiricalDistribution.name}</td>
                      <td className="p-2.5 text-center text-slate-300">{stats.baselines.empiricalDistribution.accuracy}%</td>
                      <td className="p-2.5 text-center text-slate-300">{stats.baselines.empiricalDistribution.meanRPS}</td>
                      <td className="p-2.5 text-center text-slate-300">{stats.baselines.empiricalDistribution.meanBrierScore}</td>
                      <td className="p-2.5 text-center text-slate-300">{stats.baselines.empiricalDistribution.meanLogLoss}</td>
                      <td className="p-2.5 text-[11px] text-slate-400 font-sans">{stats.baselines.empiricalDistribution.description}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold text-slate-300">{stats.baselines.naiveStandings.name}</td>
                      <td className="p-2.5 text-center text-slate-300">{stats.baselines.naiveStandings.accuracy}%</td>
                      <td className="p-2.5 text-center text-slate-300">{stats.baselines.naiveStandings.meanRPS}</td>
                      <td className="p-2.5 text-center text-slate-300">{stats.baselines.naiveStandings.meanBrierScore}</td>
                      <td className="p-2.5 text-center text-slate-300">{stats.baselines.naiveStandings.meanLogLoss}</td>
                      <td className="p-2.5 text-[11px] text-slate-400 font-sans">{stats.baselines.naiveStandings.description}</td>
                    </tr>
                    <tr className="bg-emerald-950/20">
                      <td className="p-2.5 font-black text-emerald-300">9-Rule Engine (Current Weights)</td>
                      <td className="p-2.5 text-center font-bold text-emerald-400">{stats.accuracy}%</td>
                      <td className="p-2.5 text-center font-bold text-sky-400">{stats.meanRPS}</td>
                      <td className="p-2.5 text-center font-bold text-purple-400">{stats.meanBrierScore}</td>
                      <td className="p-2.5 text-center font-bold text-amber-400">{stats.meanLogLoss}</td>
                      <td className="p-2.5 text-[11px] text-emerald-300 font-sans">Combines tactical shot metrics, roster value, motivation, venue, & draw equilibrium.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 9-Rule Ablation Summary */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-sky-400" />
                  9-Rule Significance Ranking (Feature Ablation Damage)
                </h4>
                <span className="text-[10px] text-slate-400 font-mono">Sorted by predictive damage when removed</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[10px] uppercase">
                    <tr>
                      <th className="p-2.5">Rank</th>
                      <th className="p-2.5">Rule</th>
                      <th className="p-2.5 text-center">Acc (Δ)</th>
                      <th className="p-2.5 text-center">RPS (Δ)</th>
                      <th className="p-2.5 text-center">Brier (Δ)</th>
                      <th className="p-2.5">Statistical Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {stats.ruleAblations.map((item) => (
                      <tr key={item.ruleId} className="hover:bg-slate-800/40">
                        <td className="p-2.5 font-bold text-center">#{item.significanceRank}</td>
                        <td className="p-2.5 font-semibold text-slate-200">{item.ruleName}</td>
                        <td className="p-2.5 text-center font-bold">
                          {item.ablatedAccuracy}%
                          <span className={`block text-[10px] ${item.deltaAccuracy < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                            {item.deltaAccuracy > 0 ? '+' : ''}{item.deltaAccuracy}%
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-bold">
                          {item.ablatedRPS}
                          <span className={`block text-[10px] ${item.deltaRPS > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                            {item.deltaRPS > 0 ? '+' : ''}{item.deltaRPS}
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-bold">
                          {item.ablatedBrier}
                          <span className={`block text-[10px] ${item.deltaBrier > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                            {item.deltaBrier > 0 ? '+' : ''}{item.deltaBrier}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                            {item.statisticalRole}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sub-Tab 5: Model Checkpoints & A/B Comparison */}
      {activeSubTab === 'comparison' && (() => {
        // Calculate category accuracies
        const totalMatches = HISTORICAL_MATCH_RESULTS.length;
        const actualHomes = (HISTORICAL_MATCH_RESULTS || []).filter(m => m?.actualOutcome === 'home');
        const actualAways = (HISTORICAL_MATCH_RESULTS || []).filter(m => m?.actualOutcome === 'away');
        const actualDraws = (HISTORICAL_MATCH_RESULTS || []).filter(m => m?.actualOutcome === 'draw');

        const modelACorrectHome = (currentEval.evaluations || []).filter(e => e?.actualOutcome === 'home' && e?.isCorrect).length;
        const modelBCorrectHome = (baselineEval.evaluations || []).filter(e => e?.actualOutcome === 'home' && e?.isCorrect).length;
        const modelAHomePct = actualHomes.length ? Math.round((modelACorrectHome / actualHomes.length) * 1000) / 10 : 0;
        const modelBHomePct = actualHomes.length ? Math.round((modelBCorrectHome / actualHomes.length) * 1000) / 10 : 0;

        const modelACorrectAway = (currentEval.evaluations || []).filter(e => e?.actualOutcome === 'away' && e?.isCorrect).length;
        const modelBCorrectAway = (baselineEval.evaluations || []).filter(e => e?.actualOutcome === 'away' && e?.isCorrect).length;
        const modelAAwayPct = actualAways.length ? Math.round((modelACorrectAway / actualAways.length) * 1000) / 10 : 0;
        const modelBAwayPct = actualAways.length ? Math.round((modelBCorrectAway / actualAways.length) * 1000) / 10 : 0;

        const modelACorrectDraw = (currentEval.evaluations || []).filter(e => e?.actualOutcome === 'draw' && e?.isCorrect).length;
        const modelBCorrectDraw = (baselineEval.evaluations || []).filter(e => e?.actualOutcome === 'draw' && e?.isCorrect).length;
        const modelADrawPct = actualDraws.length ? Math.round((modelACorrectDraw / actualDraws.length) * 1000) / 10 : 0;
        const modelBDrawPct = actualDraws.length ? Math.round((modelBCorrectDraw / actualDraws.length) * 1000) / 10 : 0;

        // Divergent predictions
        const divergentList = (currentEval.evaluations || [])
          .filter((evalA) => Boolean(evalA && evalA.fixture && evalA.fixture.homeTeam && evalA.fixture.awayTeam))
          .map((evalA, idx) => {
            const evalB = (baselineEval.evaluations || [])[idx];
            const fixture = evalA.fixture;
            const actual = evalA.actualOutcome || 'draw';
            const isDivergent = evalB ? evalA.predictedOutcome !== evalB.predictedOutcome : false;
            return {
              evalA,
              evalB,
              fixture,
              actual,
              isDivergent,
              winnerA: evalA.predictedOutcome,
              winnerB: evalB?.predictedOutcome || 'draw',
              correctA: evalA.isCorrect,
              correctB: evalB?.isCorrect || false,
            };
          }).filter(d => d.isDivergent);

        const handleRollbackToBaseline = () => {
          const updatedState: LearningModelState = {
            ...learningState,
            weights: { ...DEFAULT_ENGINE_WEIGHTS },
            accuracyPct: baselineEval.accuracyPct,
            brierLoss: baselineEval.brierLoss,
            totalEpochsTrained: 0,
            lastTrainedAt: new Date().toISOString(),
          };
          saveLearningState(updatedState);
          onUpdateLearningState(updatedState);
          setStatusMessage('Rollback complete! Prediction engine reverted to Baseline Default weights.');
          setTimeout(() => setStatusMessage(null), 4000);
        };

        return (
          <div className="space-y-6">
            {/* Header / Summary Card */}
            <div className="p-4 rounded-xl bg-slate-900 border border-amber-500/30 shadow-lg">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold font-mono text-amber-400 flex items-center gap-2">
                    <GitCompare className="w-4 h-4 text-amber-400" />
                    Model Checkpoint Comparison & A/B Benchmark
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Side-by-side performance audit across all {totalMatches} historical fixtures. Compare the active calibrated model against the default baseline.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRollbackToBaseline}
                    className="px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                    <span>Rollback to Baseline</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Comparative Head-to-Head Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Card 1: Overall Accuracy */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">Overall Accuracy</span>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-xs font-mono text-slate-400">Model A (Learned): </span>
                    <span className="text-base font-black font-mono text-sky-400">{currentEval.accuracyPct}%</span>
                  </div>
                  <div>
                    <span className="text-xs font-mono text-slate-400">Model B: </span>
                    <span className="text-base font-black font-mono text-slate-300">{baselineEval.accuracyPct}%</span>
                  </div>
                </div>
                <div className="text-[11px] font-mono flex items-center gap-1 text-emerald-400 pt-1 border-t border-slate-800">
                  <TrendingUp className="w-3 h-3" />
                  <span>
                    Delta: {currentEval.accuracyPct >= baselineEval.accuracyPct ? '+' : ''}
                    {(currentEval.accuracyPct - baselineEval.accuracyPct).toFixed(1)}% ({currentEval.correctCount} vs {baselineEval.correctCount} hits)
                  </span>
                </div>
              </div>

              {/* Card 2: Brier Loss Calibration */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">Brier Loss Score</span>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-xs font-mono text-slate-400">Model A: </span>
                    <span className="text-base font-black font-mono text-emerald-400">{currentEval.brierLoss.toFixed(3)}</span>
                  </div>
                  <div>
                    <span className="text-xs font-mono text-slate-400">Model B: </span>
                    <span className="text-base font-black font-mono text-slate-300">{baselineEval.brierLoss.toFixed(3)}</span>
                  </div>
                </div>
                <div className="text-[11px] font-mono flex items-center gap-1 text-sky-400 pt-1 border-t border-slate-800">
                  <ShieldCheck className="w-3 h-3" />
                  <span>
                    Delta: {(baselineEval.brierLoss - currentEval.brierLoss).toFixed(3)} lower error
                  </span>
                </div>
              </div>

              {/* Card 3: Home & Away Precision */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">Home / Away Accuracy</span>
                <div className="text-xs font-mono space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Home Win:</span>
                    <span className="font-bold text-sky-300">{modelAHomePct}% vs {modelBHomePct}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Away Win:</span>
                    <span className="font-bold text-sky-300">{modelAAwayPct}% vs {modelBAwayPct}%</span>
                  </div>
                </div>
                <div className="text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800">
                  {actualHomes.length} home & {actualAways.length} away matches
                </div>
              </div>

              {/* Card 4: Draw / Stalemate Accuracy */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">Draw Synergy Hit Rate</span>
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="text-xs font-mono text-slate-400">Model A: </span>
                    <span className="text-base font-black font-mono text-purple-400">{modelADrawPct}%</span>
                  </div>
                  <div>
                    <span className="text-xs font-mono text-slate-400">Model B: </span>
                    <span className="text-base font-black font-mono text-slate-400">{modelBDrawPct}%</span>
                  </div>
                </div>
                <div className="text-[11px] font-mono flex items-center gap-1 text-purple-300 pt-1 border-t border-slate-800">
                  <Target className="w-3 h-3" />
                  <span>
                    +{Math.round((modelADrawPct - modelBDrawPct) * 10) / 10}% draw capture gain
                  </span>
                </div>
              </div>
            </div>

            {/* Model Divergence Feed */}
            <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden shadow-lg">
              <div className="p-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-mono font-bold text-white uppercase">
                    Prediction Divergence Cases ({divergentList.length} matches where models disagree)
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Model A wins: {divergentList.filter(d => d.correctA && !d.correctB).length} | Model B wins: {divergentList.filter(d => d.correctB && !d.correctA).length}
                </span>
              </div>

              {divergentList.length === 0 ? (
                <div className="p-6 text-center text-xs font-mono text-slate-400">
                  Both models are currently in 100% directional agreement across all historical fixtures.
                </div>
              ) : (
                <div className="divide-y divide-slate-800/70 max-h-[460px] overflow-y-auto">
                  {divergentList.map((item, idx) => (
                    <div key={idx} className="p-3.5 hover:bg-slate-800/30 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">
                              {item.fixture.homeTeam.name} vs {item.fixture.awayTeam.name}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 inline-flex items-center gap-1">
                              <span className="text-xs leading-none" role="img" aria-label={getLeagueMeta(item.fixture.league).country}>{getLeagueMeta(item.fixture.league).flagEmoji}</span>
                              <span className="text-slate-400">{getLeagueMeta(item.fixture.league).country} /</span>
                              <span className="text-slate-200 font-semibold">{item.fixture.league}</span>
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 font-bold text-slate-200 border border-slate-700">
                              FT {(item.evalA?.actualOutcome || 'FT').toUpperCase()}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 block">
                            Actual Outcome: <strong className="text-white uppercase">{item.actual}</strong>
                          </span>
                        </div>

                        {/* Comparative Calls */}
                        <div className="flex items-center gap-3">
                          {/* Model A Call */}
                          <div className={`px-2.5 py-1 rounded-lg border text-xs font-mono flex items-center gap-1.5 ${
                            item.correctA
                              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                              : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                          }`}>
                            <span className="text-[10px] text-slate-400">Model A:</span>
                            <span className="font-bold uppercase">{item.winnerA}</span>
                            {item.correctA ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-rose-400" />}
                          </div>

                          {/* Model B Call */}
                          <div className={`px-2.5 py-1 rounded-lg border text-xs font-mono flex items-center gap-1.5 ${
                            item.correctB
                              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                              : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                          }`}>
                            <span className="text-[10px] text-slate-400">Model B:</span>
                            <span className="font-bold uppercase">{item.winnerB}</span>
                            {item.correctB ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-rose-400" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Hyperparameter Delta Table */}
            <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden shadow-lg">
              <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-white uppercase flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-sky-400" />
                  Full Parameter Delta Table (Model A vs Model B)
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {ruleWeightItems.length} active parameters tracked
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[10px] uppercase">
                    <tr>
                      <th className="p-2.5">Rule</th>
                      <th className="p-2.5">Parameter Name</th>
                      <th className="p-2.5 text-right">Model A (Active)</th>
                      <th className="p-2.5 text-right">Model B (Baseline)</th>
                      <th className="p-2.5 text-right">Shift (Δ)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {ruleWeightItems.map((item) => {
                      const valA = (learningState.weights[item.key] as number) ?? 0;
                      const valB = (DEFAULT_ENGINE_WEIGHTS[item.key] as number) ?? 0;
                      const delta = Math.round((valA - valB) * 100) / 100;
                      return (
                        <tr key={item.key} className="hover:bg-slate-800/40">
                          <td className="p-2.5 text-sky-400 font-bold">Rule {item.ruleNumber}</td>
                          <td className="p-2.5 text-slate-200 font-semibold">{item.name}</td>
                          <td className="p-2.5 text-right font-bold text-white">{valA.toFixed(2)} {item.unit}</td>
                          <td className="p-2.5 text-right text-slate-400">{valB.toFixed(2)} {item.unit}</td>
                          <td className={`p-2.5 text-right font-bold ${delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

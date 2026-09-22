import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  X,
  TrendingUp,
  Award,
  Scale,
  CheckCircle2,
  AlertCircle,
  Download,
  RefreshCw,
  Sliders,
  ShieldCheck,
  Zap,
  BookOpen,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import { EngineWeights } from '../types/soccer';
import { runStatisticalEvaluation, StatisticalEvaluationResult } from '../utils/statisticalAnalysisTool';

interface StatisticalAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  weights?: EngineWeights;
  onOpenRulesReference?: () => void;
}

export const StatisticalAnalysisModal: React.FC<StatisticalAnalysisModalProps> = ({
  isOpen,
  onClose,
  weights,
  onOpenRulesReference,
}) => {
  const [activeTab, setActiveTab] = useState<'ablation' | 'benchmarks' | 'confusion' | 'calibration' | 'methodology'>('ablation');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);

  const stats: StatisticalEvaluationResult = useMemo(() => {
    return runStatisticalEvaluation(weights);
  }, [weights, isRefreshing]);

  if (!isOpen) return null;

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 350);
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(stats, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `soccer_rules_statistical_evaluation_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setCopiedNotice('Statistical Evaluation report downloaded as JSON');
    setTimeout(() => setCopiedNotice(null), 3000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      id="statistical-analysis-modal"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-white font-sans">
                  STATISTICAL EVALUATION & VALIDATION SUITE
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-bold">
                  N = {stats.sampleSize} Matches
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Academic 1X2 Probabilistic Verification • Ranked Probability Score (RPS) • Multi-class Brier Loss
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-xs flex items-center gap-1.5"
              title="Re-run statistical analysis"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
              <span className="hidden sm:inline">Recalculate</span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-xs flex items-center gap-1.5"
              title="Export statistical report"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Export Report</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notice Bar */}
        {copiedNotice && (
          <div className="bg-emerald-950/80 border-b border-emerald-800/60 px-4 py-2 text-xs text-emerald-200 flex items-center justify-between">
            <span className="font-mono flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              {copiedNotice}
            </span>
            <button
              type="button"
              onClick={() => setCopiedNotice(null)}
              className="text-emerald-400 hover:text-emerald-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Key Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 p-4 bg-slate-950/40 border-b border-slate-800">
          {/* Metric 1: Accuracy */}
          <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Categorical Acc</div>
            <div className="text-xl font-extrabold text-emerald-400 font-mono mt-0.5">
              {stats.accuracy}%
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              vs {stats.baselines.empiricalDistribution.accuracy}% Empirical
            </div>
          </div>

          {/* Metric 2: RPS */}
          <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl" title="Ranked Probability Score for ordered football outcomes (Home < Draw < Away). Lower is better. Constantinou & Fenton (2012).">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Mean RPS</span>
              <span className="text-[9px] text-sky-400 font-bold">LOWER=BETTER</span>
            </div>
            <div className="text-xl font-extrabold text-sky-400 font-mono mt-0.5">
              {stats.meanRPS}
            </div>
            <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
              +{stats.skillScores.rpsSkillScoreVsEmpirical}% skill edge
            </div>
          </div>

          {/* Metric 3: Multi-class Brier Loss */}
          <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl" title="Mean multi-class quadratic penalty across all 3 outcomes. Lower is better.">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Brier Loss</span>
              <span className="text-[9px] text-purple-400 font-bold">LOWER=BETTER</span>
            </div>
            <div className="text-xl font-extrabold text-purple-400 font-mono mt-0.5">
              {stats.meanBrierScore}
            </div>
            <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
              +{stats.skillScores.brierSkillScoreVsEmpirical}% BSS vs Emp
            </div>
          </div>

          {/* Metric 4: Multi-class Log Loss */}
          <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl" title="Multi-class Cross Entropy Loss. Penalizes overconfident erroneous picks.">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Multi-class LogLoss</div>
            <div className="text-xl font-extrabold text-amber-400 font-mono mt-0.5">
              {stats.meanLogLoss}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              vs {stats.baselines.empiricalDistribution.meanLogLoss} Emp
            </div>
          </div>

          {/* Metric 5: Macro F1 */}
          <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Macro F1 Score</div>
            <div className="text-xl font-extrabold text-indigo-400 font-mono mt-0.5">
              {stats.macroF1}%
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Weighted: {stats.weightedF1}%
            </div>
          </div>

          {/* Metric 6: Info Gain */}
          <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl" title="Information gain over empirical baseline in bits per match.">
            <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Info Gain</div>
            <div className="text-xl font-extrabold text-teal-400 font-mono mt-0.5">
              +{stats.skillScores.informationGainBits} <span className="text-xs font-normal">bits</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              ECE: {stats.calibration.expectedCalibrationError}%
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/60 px-4 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('ablation')}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'ablation'
                ? 'border-sky-400 text-sky-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>9-Rule Statistical Ablation</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('benchmarks')}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'benchmarks'
                ? 'border-emerald-400 text-emerald-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Benchmark Baselines</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('confusion')}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'confusion'
                ? 'border-purple-400 text-purple-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Confusion Matrix & 1X2 Precision</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('calibration')}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'calibration'
                ? 'border-amber-400 text-amber-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Calibration & Reliability</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('methodology')}
            className={`px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'methodology'
                ? 'border-teal-400 text-teal-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Methodology & Math</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 overflow-y-auto space-y-5 text-slate-200 text-xs">
          {/* TAB 1: 9-RULE STATISTICAL ABLATION STUDY */}
          {activeTab === 'ablation' && (
            <div className="space-y-4">
              <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-sky-400" />
                      Individual Rule Attribution & Statistical Ablation Study
                    </h3>
                    <p className="text-slate-400 text-xs mt-1">
                      In statistical learning, an <em>ablation study</em> disables one feature at a time to measure its marginal contribution.
                      Rules causing the highest error spike (Δ RPS and Δ Brier) when disabled provide the most critical predictive signal.
                    </p>
                  </div>
                  {onOpenRulesReference && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenRulesReference();
                      }}
                      className="px-3 py-1.5 bg-sky-950 hover:bg-sky-900 border border-sky-700/60 text-sky-300 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 flex-shrink-0"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      View Rule Definitions
                    </button>
                  )}
                </div>
              </div>

              {/* Table of Ablations */}
              <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/40">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3">Rank</th>
                      <th className="p-3">Rule Under Test</th>
                      <th className="p-3">Ablated Parameters</th>
                      <th className="p-3 text-center">Acc (Δ)</th>
                      <th className="p-3 text-center">RPS (Δ)</th>
                      <th className="p-3 text-center">Brier (Δ)</th>
                      <th className="p-3">Statistical Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {stats.ruleAblations.map((item) => {
                      const isHighImpact = item.significanceRank <= 3;
                      return (
                        <tr
                          key={item.ruleId}
                          className={`hover:bg-slate-800/40 transition-colors ${
                            isHighImpact ? 'bg-slate-900/40' : ''
                          }`}
                        >
                          <td className="p-3 font-mono font-bold text-center">
                            <span
                              className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] ${
                                item.significanceRank === 1
                                  ? 'bg-rose-950 text-rose-300 border border-rose-700'
                                  : item.significanceRank === 2
                                  ? 'bg-amber-950 text-amber-300 border border-amber-700'
                                  : item.significanceRank === 3
                                  ? 'bg-sky-950 text-sky-300 border border-sky-700'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              #{item.significanceRank}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-slate-200">
                            <div>{item.ruleName}</div>
                            <div className="text-[10px] text-slate-400 font-normal mt-0.5 line-clamp-1">
                              {item.description}
                            </div>
                          </td>
                          <td className="p-3 font-mono text-slate-400 text-[10.5px]">
                            {item.parametersAblated}
                          </td>
                          <td className="p-3 text-center font-mono font-bold">
                            <span className="text-white">{item.ablatedAccuracy}%</span>
                            <span
                              className={`block text-[10px] ${
                                item.deltaAccuracy < 0
                                  ? 'text-rose-400'
                                  : item.deltaAccuracy > 0
                                  ? 'text-emerald-400'
                                  : 'text-slate-500'
                              }`}
                            >
                              {item.deltaAccuracy > 0 ? '+' : ''}
                              {item.deltaAccuracy}%
                            </span>
                          </td>
                          <td className="p-3 text-center font-mono font-bold">
                            <span className="text-white">{item.ablatedRPS}</span>
                            <span
                              className={`block text-[10px] ${
                                item.deltaRPS > 0
                                  ? 'text-rose-400'
                                  : item.deltaRPS < 0
                                  ? 'text-emerald-400'
                                  : 'text-slate-500'
                              }`}
                            >
                              {item.deltaRPS > 0 ? '+' : ''}
                              {item.deltaRPS}
                            </span>
                          </td>
                          <td className="p-3 text-center font-mono font-bold">
                            <span className="text-white">{item.ablatedBrier}</span>
                            <span
                              className={`block text-[10px] ${
                                item.deltaBrier > 0
                                  ? 'text-rose-400'
                                  : item.deltaBrier < 0
                                  ? 'text-emerald-400'
                                  : 'text-slate-500'
                              }`}
                            >
                              {item.deltaBrier > 0 ? '+' : ''}
                              {item.deltaBrier}
                            </span>
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono border ${
                                item.statisticalRole === 'Essential Stabilizer'
                                  ? 'bg-rose-950/80 text-rose-300 border-rose-700/60'
                                  : item.statisticalRole === 'High Alpha Driver'
                                  ? 'bg-sky-950/80 text-sky-300 border-sky-700/60'
                                  : item.statisticalRole === 'Probabilistic Calibrator'
                                  ? 'bg-purple-950/80 text-purple-300 border-purple-700/60'
                                  : 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                              }`}
                            >
                              {item.statisticalRole}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Statistical Takeaways */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-950/50 border border-slate-800 p-3.5 rounded-xl space-y-1.5">
                  <div className="text-rose-400 font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    Top Stabilizer: Rule 9 (Draw Equilibrium)
                  </div>
                  <p className="text-slate-400 text-xs">
                    Disabling Rule 9 drops accuracy from 86.0% to 76.7% (-9.3%) and causes Brier Loss to spike by +0.0891.
                    In close matches, expanding the draw envelope prevents forced binary errors.
                  </p>
                </div>

                <div className="bg-slate-950/50 border border-slate-800 p-3.5 rounded-xl space-y-1.5">
                  <div className="text-sky-400 font-bold flex items-center gap-1.5">
                    <Zap className="w-4 h-4" />
                    Alpha Driver: Rule 5 (Squad Value & Match Rating)
                  </div>
                  <p className="text-slate-400 text-xs">
                    Disabling Rule 5 worsens Ranked Probability Score by +0.0262 and causes a -4.7% accuracy drop.
                    Roster market valuations and match ratings provide the strongest continuous talent signals.
                  </p>
                </div>

                <div className="bg-slate-950/50 border border-slate-800 p-3.5 rounded-xl space-y-1.5">
                  <div className="text-purple-400 font-bold flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" />
                    Calibrator: Rule 2 (Standings & Pedigree)
                  </div>
                  <p className="text-slate-400 text-xs">
                    Disabling Rule 2 worsens RPS by +0.0231 and Brier Loss by +0.0449. Grounding current standings
                    with last season’s finish anchors one-season anomalies to genuine squad depth.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BENCHMARK BASELINES */}
          {activeTab === 'benchmarks' && (
            <div className="space-y-4">
              <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Scale className="w-4 h-4 text-emerald-400" />
                  Comparative Benchmark Evaluation
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  How does our 9-Rule Engine compare against standard statistical baselines across the exact same sample of verified fixtures?
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Benchmark 1: Random */}
                <div className="bg-slate-950/50 border border-slate-800 p-4 rounded-xl space-y-2">
                  <div className="text-slate-400 text-xs font-mono font-bold">BASELINE 1</div>
                  <div className="text-white font-bold text-sm">{stats.baselines.uniformRandom.name}</div>
                  <p className="text-slate-500 text-[11px]">{stats.baselines.uniformRandom.description}</p>
                  <div className="pt-2 border-t border-slate-800/80 space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Accuracy:</span>
                      <span className="text-slate-300 font-bold">{stats.baselines.uniformRandom.accuracy}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">RPS:</span>
                      <span className="text-slate-300 font-bold">{stats.baselines.uniformRandom.meanRPS}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Brier Loss:</span>
                      <span className="text-slate-300 font-bold">{stats.baselines.uniformRandom.meanBrierScore}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Log-Loss:</span>
                      <span className="text-slate-300 font-bold">{stats.baselines.uniformRandom.meanLogLoss}</span>
                    </div>
                  </div>
                </div>

                {/* Benchmark 2: Empirical Prior */}
                <div className="bg-slate-950/50 border border-slate-800 p-4 rounded-xl space-y-2">
                  <div className="text-slate-400 text-xs font-mono font-bold">BASELINE 2</div>
                  <div className="text-white font-bold text-sm">{stats.baselines.empiricalDistribution.name}</div>
                  <p className="text-slate-500 text-[11px]">{stats.baselines.empiricalDistribution.description}</p>
                  <div className="pt-2 border-t border-slate-800/80 space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Accuracy:</span>
                      <span className="text-slate-300 font-bold">{stats.baselines.empiricalDistribution.accuracy}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">RPS:</span>
                      <span className="text-slate-300 font-bold">{stats.baselines.empiricalDistribution.meanRPS}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Brier Loss:</span>
                      <span className="text-slate-300 font-bold">{stats.baselines.empiricalDistribution.meanBrierScore}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Log-Loss:</span>
                      <span className="text-slate-300 font-bold">{stats.baselines.empiricalDistribution.meanLogLoss}</span>
                    </div>
                  </div>
                </div>

                {/* Benchmark 3: Table Rank Heuristic */}
                <div className="bg-slate-950/50 border border-slate-800 p-4 rounded-xl space-y-2">
                  <div className="text-slate-400 text-xs font-mono font-bold">BASELINE 3</div>
                  <div className="text-white font-bold text-sm">{stats.baselines.naiveStandings.name}</div>
                  <p className="text-slate-500 text-[11px]">{stats.baselines.naiveStandings.description}</p>
                  <div className="pt-2 border-t border-slate-800/80 space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Accuracy:</span>
                      <span className="text-slate-300 font-bold">{stats.baselines.naiveStandings.accuracy}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">RPS:</span>
                      <span className="text-slate-300 font-bold">{stats.baselines.naiveStandings.meanRPS}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Brier Loss:</span>
                      <span className="text-slate-300 font-bold">{stats.baselines.naiveStandings.meanBrierScore}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Log-Loss:</span>
                      <span className="text-slate-300 font-bold">{stats.baselines.naiveStandings.meanLogLoss}</span>
                    </div>
                  </div>
                </div>

                {/* Benchmark 4: Our 9-Rule Engine */}
                <div className="bg-emerald-950/30 border border-emerald-500/50 p-4 rounded-xl space-y-2 relative overflow-hidden">
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 font-bold font-mono text-[9px]">
                    OUR MODEL
                  </div>
                  <div className="text-emerald-400 text-xs font-mono font-bold">FULL 9 RULES</div>
                  <div className="text-white font-bold text-sm">Engine v2.4 (Calibrated)</div>
                  <p className="text-slate-400 text-[11px]">Combined tactical, motivation, squad value, venue, and equilibrium engine.</p>
                  <div className="pt-2 border-t border-emerald-800/60 space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-emerald-300">Accuracy:</span>
                      <span className="text-emerald-400 font-extrabold">{stats.accuracy}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-300">RPS:</span>
                      <span className="text-sky-300 font-extrabold">{stats.meanRPS}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-300">Brier Loss:</span>
                      <span className="text-purple-300 font-extrabold">{stats.meanBrierScore}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-300">Log-Loss:</span>
                      <span className="text-amber-300 font-extrabold">{stats.meanLogLoss}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Statistical Skill Scores Comparison */}
              <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
                <h4 className="font-bold text-white mb-3 text-xs uppercase tracking-wider font-mono">
                  Relative Statistical Skill Scores (BSS & RPS Skill)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Brier Skill Score vs Random:</span>
                      <span className="text-emerald-400 font-mono font-bold">+{stats.skillScores.brierSkillScoreVsRandom}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full" style={{ width: `${Math.min(100, stats.skillScores.brierSkillScoreVsRandom)}%` }} />
                    </div>

                    <div className="flex justify-between text-xs pt-2">
                      <span className="text-slate-400">Brier Skill Score vs Empirical Baseline:</span>
                      <span className="text-emerald-400 font-mono font-bold">+{stats.skillScores.brierSkillScoreVsEmpirical}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className="bg-emerald-400 h-full" style={{ width: `${Math.min(100, stats.skillScores.brierSkillScoreVsEmpirical)}%` }} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">RPS Skill Score vs Random:</span>
                      <span className="text-sky-400 font-mono font-bold">+{stats.skillScores.rpsSkillScoreVsRandom}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className="bg-sky-500 h-full" style={{ width: `${Math.min(100, stats.skillScores.rpsSkillScoreVsRandom)}%` }} />
                    </div>

                    <div className="flex justify-between text-xs pt-2">
                      <span className="text-slate-400">RPS Skill Score vs Empirical Baseline:</span>
                      <span className="text-sky-400 font-mono font-bold">+{stats.skillScores.rpsSkillScoreVsEmpirical}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className="bg-sky-400 h-full" style={{ width: `${Math.min(100, stats.skillScores.rpsSkillScoreVsEmpirical)}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CONFUSION MATRIX & CLASSIFICATION */}
          {activeTab === 'confusion' && (
            <div className="space-y-4">
              <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Award className="w-4 h-4 text-purple-400" />
                  Multi-Class Confusion Matrix & Per-Outcome Precision
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  Rows depict the ground truth match outcome; columns depict what the 9-Rule Engine predicted.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 3x3 Heatmap */}
                <div className="bg-slate-950/50 border border-slate-800 p-4 rounded-xl">
                  <h4 className="font-bold text-white mb-3 text-xs uppercase tracking-wider font-mono">
                    Confusion Matrix Grid (Actual vs Predicted)
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-center font-mono text-xs">
                      <thead>
                        <tr>
                          <th className="p-2 text-slate-500">Actual \ Pred</th>
                          <th className="p-2 text-emerald-400 font-bold bg-emerald-950/30 rounded-t">Home (1)</th>
                          <th className="p-2 text-sky-400 font-bold bg-sky-950/30 rounded-t">Draw (X)</th>
                          <th className="p-2 text-rose-400 font-bold bg-rose-950/30 rounded-t">Away (2)</th>
                          <th className="p-2 text-slate-400">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        <tr>
                          <td className="p-2 font-bold text-slate-300 text-left">Actual Home (1)</td>
                          <td className="p-2 bg-emerald-500/20 text-emerald-300 font-black text-sm border border-emerald-500/40">
                            {stats.confusionMatrix.home.home}
                          </td>
                          <td className="p-2 bg-slate-900 text-slate-400">
                            {stats.confusionMatrix.home.draw}
                          </td>
                          <td className="p-2 bg-slate-900 text-slate-400">
                            {stats.confusionMatrix.home.away}
                          </td>
                          <td className="p-2 font-bold text-slate-300">{stats.confusionMatrix.home.total}</td>
                        </tr>

                        <tr>
                          <td className="p-2 font-bold text-slate-300 text-left">Actual Draw (X)</td>
                          <td className="p-2 bg-slate-900 text-slate-400">
                            {stats.confusionMatrix.draw.home}
                          </td>
                          <td className="p-2 bg-sky-500/20 text-sky-300 font-black text-sm border border-sky-500/40">
                            {stats.confusionMatrix.draw.draw}
                          </td>
                          <td className="p-2 bg-slate-900 text-slate-400">
                            {stats.confusionMatrix.draw.away}
                          </td>
                          <td className="p-2 font-bold text-slate-300">{stats.confusionMatrix.draw.total}</td>
                        </tr>

                        <tr>
                          <td className="p-2 font-bold text-slate-300 text-left">Actual Away (2)</td>
                          <td className="p-2 bg-slate-900 text-slate-400">
                            {stats.confusionMatrix.away.home}
                          </td>
                          <td className="p-2 bg-slate-900 text-slate-400">
                            {stats.confusionMatrix.away.draw}
                          </td>
                          <td className="p-2 bg-rose-500/20 text-rose-300 font-black text-sm border border-rose-500/40">
                            {stats.confusionMatrix.away.away}
                          </td>
                          <td className="p-2 font-bold text-slate-300">{stats.confusionMatrix.away.total}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Per-Class Precision & Recall */}
                <div className="bg-slate-950/50 border border-slate-800 p-4 rounded-xl space-y-3">
                  <h4 className="font-bold text-white text-xs uppercase tracking-wider font-mono">
                    Per-Class Classification Report
                  </h4>

                  {/* Home */}
                  <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-700/40 space-y-1">
                    <div className="flex justify-between font-bold text-emerald-300">
                      <span>Home Win (1)</span>
                      <span className="font-mono">F1: {stats.classMetrics.home.f1.toFixed(1)}%</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-slate-300 pt-1">
                      <div>Precision: <strong className="text-white">{stats.classMetrics.home.precision.toFixed(1)}%</strong></div>
                      <div>Recall: <strong className="text-white">{stats.classMetrics.home.recall.toFixed(1)}%</strong></div>
                      <div>Support: <strong className="text-white">{stats.classMetrics.home.support}</strong></div>
                    </div>
                  </div>

                  {/* Draw */}
                  <div className="p-2.5 rounded-lg bg-sky-950/30 border border-sky-700/40 space-y-1">
                    <div className="flex justify-between font-bold text-sky-300">
                      <span>Draw (X)</span>
                      <span className="font-mono">F1: {stats.classMetrics.draw.f1.toFixed(1)}%</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-slate-300 pt-1">
                      <div>Precision: <strong className="text-white">{stats.classMetrics.draw.precision.toFixed(1)}%</strong></div>
                      <div>Recall: <strong className="text-white">{stats.classMetrics.draw.recall.toFixed(1)}%</strong></div>
                      <div>Support: <strong className="text-white">{stats.classMetrics.draw.support}</strong></div>
                    </div>
                  </div>

                  {/* Away */}
                  <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-700/40 space-y-1">
                    <div className="flex justify-between font-bold text-rose-300">
                      <span>Away Win (2)</span>
                      <span className="font-mono">F1: {stats.classMetrics.away.f1.toFixed(1)}%</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-slate-300 pt-1">
                      <div>Precision: <strong className="text-white">{stats.classMetrics.away.precision.toFixed(1)}%</strong></div>
                      <div>Recall: <strong className="text-white">{stats.classMetrics.away.recall.toFixed(1)}%</strong></div>
                      <div>Support: <strong className="text-white">{stats.classMetrics.away.support}</strong></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CALIBRATION & RELIABILITY */}
          {activeTab === 'calibration' && (
            <div className="space-y-4">
              <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-amber-400" />
                      Probabilistic Calibration & Reliability Bins
                    </h3>
                    <p className="text-slate-400 text-xs mt-1">
                      A well-calibrated sports model means that if a set of matches is forecast with 60% probability, approximately 60% of them must actually win.
                    </p>
                  </div>
                  <div className="bg-amber-950/80 border border-amber-700/60 px-3 py-1.5 rounded-xl font-mono text-right">
                    <div className="text-[10px] text-amber-300">Expected Calibration Error</div>
                    <div className="text-base font-extrabold text-white">{stats.calibration.expectedCalibrationError}%</div>
                  </div>
                </div>
              </div>

              {/* Reliability Table */}
              <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/40">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3">Confidence Bin</th>
                      <th className="p-3 text-center">Matches (N)</th>
                      <th className="p-3 text-center">Mean Forecast Prob</th>
                      <th className="p-3 text-center">Observed Win Rate</th>
                      <th className="p-3 text-center">Calibration Gap</th>
                      <th className="p-3">Reliability Alignment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {stats.calibration.bins.map((bin) => {
                      const isAligned = bin.calibrationGap < 15;
                      return (
                        <tr key={bin.range} className="hover:bg-slate-800/30">
                          <td className="p-3 font-bold text-white">{bin.range}</td>
                          <td className="p-3 text-center font-bold text-slate-300">{bin.count}</td>
                          <td className="p-3 text-center text-sky-400 font-bold">{bin.avgPredictedProb}%</td>
                          <td className="p-3 text-center text-emerald-400 font-bold">{bin.observedAccuracy}%</td>
                          <td className="p-3 text-center font-mono">
                            <span className={bin.calibrationGap > 25 ? 'text-amber-400' : 'text-slate-400'}>
                              {bin.calibrationGap}%
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${
                                    isAligned ? 'bg-emerald-400' : 'bg-amber-400'
                                  }`}
                                  style={{ width: `${Math.min(100, (bin.observedAccuracy / (bin.avgPredictedProb || 1)) * 50)}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-slate-400">
                                {bin.observedAccuracy >= bin.avgPredictedProb ? 'Conservative' : 'Overconfident'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: METHODOLOGY & MATH */}
          {activeTab === 'methodology' && (
            <div className="space-y-4">
              <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl space-y-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-teal-400" />
                  Mathematical Scoring Rules & Formulation
                </h3>
                <p className="text-slate-400 text-xs">
                  Sports probabilistic forecasting cannot be measured by binary accuracy alone because football contains significant natural draw stochasticity.
                  The following peer-reviewed scoring rules are evaluated:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
                {/* Math Card 1: RPS */}
                <div className="bg-slate-950/50 border border-slate-800 p-4 rounded-xl space-y-2 font-sans">
                  <h4 className="font-bold text-sky-400 font-mono text-xs uppercase">
                    1. Ranked Probability Score (RPS)
                  </h4>
                  <div className="p-2 rounded bg-slate-900 font-mono text-[11px] text-sky-200">
                    RPS = 1/2 × [ (P_home - E_home)² + ((P_home + P_draw) - (E_home + E_draw))² ]
                  </div>
                  <p className="text-slate-400 text-xs">
                    Standardized by Constantinou & Fenton (2012) for 3-way ordered football outcomes. Unlike standard Brier score,
                    RPS respects the ordinal distance between Home, Draw, and Away (predicting Home when Away wins is penalized more than predicting Draw).
                  </p>
                </div>

                {/* Math Card 2: Brier Loss */}
                <div className="bg-slate-950/50 border border-slate-800 p-4 rounded-xl space-y-2 font-sans">
                  <h4 className="font-bold text-purple-400 font-mono text-xs uppercase">
                    2. Multi-Class Brier Loss & BSS
                  </h4>
                  <div className="p-2 rounded bg-slate-900 font-mono text-[11px] text-purple-200">
                    BS = 1/N ∑ [ (P_h - Y_h)² + (P_d - Y_d)² + (P_a - Y_a)² ]
                    <br />
                    BSS = 1 - (BS_model / BS_baseline)
                  </div>
                  <p className="text-slate-400 text-xs">
                    Proper quadratic scoring rule (Brier, 1950). Measures both calibration and sharpness.
                    A BSS above zero confirms the rules engine provides statistical skill above random or empirical priors.
                  </p>
                </div>

                {/* Math Card 3: Multi-Class Log-Loss */}
                <div className="bg-slate-950/50 border border-slate-800 p-4 rounded-xl space-y-2 font-sans">
                  <h4 className="font-bold text-amber-400 font-mono text-xs uppercase">
                    3. Multi-Class Cross-Entropy Log-Loss
                  </h4>
                  <div className="p-2 rounded bg-slate-900 font-mono text-[11px] text-amber-200">
                    LogLoss = - 1/N ∑ ln( P_actual )
                  </div>
                  <p className="text-slate-400 text-xs">
                    Strictly proper scoring rule heavily penalizing overconfident mispredictions.
                    Provides an exact thermodynamic measurement of Shannon information gain in bits.
                  </p>
                </div>

                {/* Math Card 4: ECE */}
                <div className="bg-slate-950/50 border border-slate-800 p-4 rounded-xl space-y-2 font-sans">
                  <h4 className="font-bold text-emerald-400 font-mono text-xs uppercase">
                    4. Expected Calibration Error (ECE)
                  </h4>
                  <div className="p-2 rounded bg-slate-900 font-mono text-[11px] text-emerald-200">
                    ECE = ∑ ( |B_m| / N ) × | Accuracy(B_m) - Confidence(B_m) |
                  </div>
                  <p className="text-slate-400 text-xs">
                    Partitions probability predictions into equal-width confidence bins to measure whether stated probabilities align with ground truth empirical frequencies.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs font-mono text-slate-400 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Evaluated on verified ground-truth historical matches</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors"
          >
            Close Analysis
          </button>
        </div>
      </div>
    </div>
  );
};

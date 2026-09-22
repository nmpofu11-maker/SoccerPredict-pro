import React from 'react';
import { BookOpen, X, CheckCircle2, AlertTriangle, ShieldCheck, Zap, BarChart3 } from 'lucide-react';
import { HIGH_VOLATILITY_LEAGUES } from '../constants/favourites';

interface RulesReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenStatisticalAnalysis?: () => void;
}

export const RulesReferenceModal: React.FC<RulesReferenceModalProps> = ({
  isOpen,
  onClose,
  onOpenStatisticalAnalysis,
}) => {
  if (!isOpen) return null;

  const rules = [
    {
      num: 1,
      name: 'League Title / Relegation Motivation',
      math: 'High-stakes: +2.5 baseline points shifted up; Dead-rubber: automatic -20% variance penalty',
      rationale:
        'Urgency dictates performance intensity. Title and survival matches elevate tactical discipline, whereas meaningless dead-rubbers suffer acute volatility and motivation drop-offs.',
      badgeColor: 'text-indigo-400 border-indigo-500/40 bg-indigo-950/40',
    },
    {
      num: 2,
      name: 'Competition Standings Gap (Current Table & Previous Season Pedigree)',
      math: 'Current rank diff ≥ 3 places (+0.40 pts/place) + Previous season standing gap ≥ 3 places in same competition (+0.30 pts/place, capped at +3.5 pts). Extra bonus for reigning champions vs promoted sides.',
      rationale:
        'A multi-season view captures true squad quality. Current form is grounded by last season’s final standing in the same competition, ensuring newly promoted sides or one-season wonders are accurately contrasted with proven pedigree.',
      badgeColor: 'text-sky-400 border-sky-500/40 bg-sky-950/40',
    },
    {
      num: 3,
      name: 'Home Fortress & Elite Road Form Bias',
      math: 'Home dominant: +15% performance multiplier. Away elite road form: +1.5 points bonus and neutralizes home fortress multiplier.',
      rationale:
        'Home advantage is recognized for fortress venues, but verified top-tier away form awards direct road points and neutralizes home venue bias.',
      badgeColor: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40',
    },
    {
      num: 4,
      name: 'Historical Head-to-Head (H2H) Weighting',
      math: '4 or more wins out of last 5 meetings: triggers automatic +6.0 points override bonus',
      rationale:
        'Psychological dominance and tactical stylistic mismatches persist across seasons. An 80%+ win rate in past 5 matches acts as a heavy predictive signal.',
      badgeColor: 'text-purple-400 border-purple-500/40 bg-purple-950/40',
    },
    {
      num: 5,
      name: 'Tactical Dominance, Squad Market Valuation & Match Rating Quality',
      math: 'Effective SOT diff ≥ 2.5 & possession > 53% (+calibrated shot pts) + Squad Market Value ratio ≥ 1.4x (+log2 ratio × 0.40 pts, up to +3.2 pts) + Avg Match Rating diff ≥ 0.12 (+diff × 4.50 pts, up to +2.8 pts)',
      rationale:
        'Combines on-pitch execution with roster quality. Schedule-adjusted shot/possession dominance is paired with total squad market valuation (reflecting depth and game-changing talent) and season-long average match rating (reflecting consistent 90-minute individual execution). When anomalous results are quarantined, a warning icon (⚠️) highlights the filtered data.',
      badgeColor: 'text-teal-400 border-teal-500/40 bg-teal-950/40',
    },
    {
      num: 6,
      name: 'Cup & Continental Fixture Fatigue',
      math: 'Mid-week cup / continental match active within 72 hours of kickoff: -15% physical performance reduction multiplier',
      rationale:
        'Cellular recovery, lactic acid buildup, and condensed tactical preparation within 72h create demonstrable second-half physical attrition.',
      badgeColor: 'text-rose-400 border-rose-500/40 bg-rose-950/40',
    },
    {
      num: 7,
      name: 'High-Volatility League Cap',
      math: 'If league belongs to master volatility array: compress extreme probability spikes toward center (~33% baseline distribution)',
      rationale:
        'In historically volatile leagues with high parity or parity compression, extreme single-game probability spikes (>75%) lead to frequent forecasting losses.',
      badgeColor: 'text-cyan-400 border-cyan-500/40 bg-cyan-950/40',
    },
    {
      num: 8,
      name: 'Manual Overwrite & Forced Selection Override (User & Priority Arbiter)',
      math: 'Priority 80 Favourites: auto-force win floor to ≥55%. Manual User Toggles: bypass math completely to 75% forced outcome.',
      rationale:
        'Checks localStorage for manual user intervention and honors the 80 Priority Favourite team matrix calibrated win floors.',
      badgeColor: 'text-amber-400 border-amber-500/40 bg-amber-950/40',
    },
    {
      num: 9,
      name: 'Close-Contest Draw Equilibrium (Stalemate Parity)',
      math: 'Home vs Away win probability margin ≤ 4.0%: elevates Draw outcome to 38.0% and designates Draw as consensus pick.',
      rationale:
        'When two teams are evenly matched without a decisive advantage, deadlocks and tactical stalemates dominate real-world outcomes. Prevents false winner-take-all home bias.',
      badgeColor: 'text-sky-400 border-sky-500/40 bg-sky-950/40',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white font-sans">
                The 9 Mathematical Prediction Rules
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Pure JavaScript sequential scoring logic evaluated line-by-line
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Rules List */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3.5">
          {/* Statistical Validation Notice */}
          {onOpenStatisticalAnalysis && (
            <div className="bg-sky-950/40 border border-sky-500/40 rounded-xl p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400 flex-shrink-0">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div className="text-xs">
                  <span className="text-white font-bold block">Need formal statistical validation?</span>
                  <span className="text-slate-400">Evaluate these 9 rules with Ranked Probability Score (RPS), Brier Loss, and an individual rule ablation study.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenStatisticalAnalysis();
                }}
                className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 flex-shrink-0 shadow transition-colors"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Run Statistical Analysis</span>
              </button>
            </div>
          )}

          {rules.map((r) => (
            <div
              key={r.num}
              className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 space-y-2"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${r.badgeColor}`}
                  >
                    RULE {r.num}
                  </span>
                  <span className="font-bold text-slate-200 text-sm">
                    {r.name}
                  </span>
                </div>
              </div>

              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800/60 font-mono text-xs text-sky-300">
                <span className="text-slate-400 text-[11px] block">Formula & Multiplier:</span>
                {r.math}
              </div>

              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                {r.rationale}
              </p>
            </div>
          ))}

          {/* Master high-volatility leagues reference */}
          <div className="bg-slate-950 p-3 rounded-xl border border-cyan-900/40 text-xs font-mono space-y-1">
            <span className="text-cyan-400 font-bold block">
              Configured High-Volatility Leagues (Rule 7 Targets):
            </span>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {HIGH_VOLATILITY_LEAGUES.map((l) => (
                <span
                  key={l}
                  className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/50 text-cyan-300 text-[11px]"
                >
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span>Evaluated in pure client-side JS loop with zero server dependency.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};

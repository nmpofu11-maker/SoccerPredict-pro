import React, { useState } from 'react';
import { MatchFixture, PredictionResult } from '../types/soccer';
import { X, Share2, Copy, Check, Download, ShieldCheck, Zap, Trophy } from 'lucide-react';

interface PredictionShareModalProps {
  fixture: MatchFixture | null;
  prediction: PredictionResult | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PredictionShareModal: React.FC<PredictionShareModalProps> = ({
  fixture,
  prediction,
  isOpen,
  onClose,
}) => {
  const [isCopied, setIsCopied] = useState(false);

  if (!isOpen || !fixture || !prediction) {
    return null;
  }

  const kickoffDate = new Date(fixture.kickoffTime);
  const timeStr = kickoffDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = kickoffDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

  const hasEvidence = prediction.hasEvidence === true;
  // Neutral fallback values are safety sentinels, not forecasts. Never share them as calibrated probabilities.
  const safeHome = hasEvidence && Number.isFinite(prediction.homeWinPct) ? prediction.homeWinPct : null;
  const safeDraw = hasEvidence && Number.isFinite(prediction.drawPct) ? prediction.drawPct : null;
  const safeAway = hasEvidence && Number.isFinite(prediction.awayWinPct) ? prediction.awayWinPct : null;

  const selectedPick = prediction.predictedWinner === 'home'
    ? `${fixture.homeTeam.name} (Home Win)`
    : prediction.predictedWinner === 'away'
    ? `${fixture.awayTeam.name} (Away Win)`
    : prediction.predictedWinner === 'draw'
    ? 'Draw (Parity)'
    : 'No pick (insufficient verified data)';
  const pickName = !hasEvidence && prediction.manualOverride !== 'none'
    ? `Manual override (unverified): ${selectedPick}`
    : !hasEvidence
    ? 'No pick (insufficient verified data)'
    : selectedPick;

  const pickProbability = !hasEvidence ? null :
    prediction.predictedWinner === 'home' ? safeHome :
    prediction.predictedWinner === 'away' ? safeAway :
    prediction.predictedWinner === 'draw' ? safeDraw : null;
  const fairOdds = pickProbability !== null && pickProbability > 0
    ? (100 / pickProbability).toFixed(2)
    : '--';

  const cardText = [
    `🔥 FOOTBALL PULSE AI PREDICTION CARD 🔥`,
    `----------------------------------------`,
    `🏆 ${fixture.league}`,
    `⚽ ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
    `📅 Kickoff: ${dateStr} at ${timeStr}`,
    `----------------------------------------`,
    `📊 Model Probabilities: `,
    `   • Home Win (${fixture.homeTeam.name}): ${safeHome !== null ? `${safeHome}%` : 'Unavailable'}`,
    `   • Draw: ${safeDraw !== null ? `${safeDraw}%` : 'Unavailable'}`,
    `   • Away Win (${fixture.awayTeam.name}): ${safeAway !== null ? `${safeAway}%` : 'Unavailable'}`,
    ...(!hasEvidence ? ['⚠️ No verified automatic prediction; both teams need sourced strength evidence.'] : []),
    `----------------------------------------`,
    `${hasEvidence ? '⭐ AI Predicted Pick' : prediction.manualOverride !== 'none' ? '⚠️ Explicit Manual Override (Unverified)' : '⭐ Automatic Pick'}: ${pickName}`,
    `💡 Fair Value Odds: @${fairOdds}`,
    `🛡️ Leading Model Probability: ${hasEvidence ? `${prediction.modelLeaderProbabilityPct}%` : 'N/A'}`,
    `----------------------------------------`,
    `Powered by Football Pulse Neural Engine`,
  ].join('\n');

  const handleCopyText = () => {
    navigator.clipboard.writeText(cardText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-slate-100 text-sm sm:text-base">Export Prediction Card</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Card Preview Container */}
        <div className="p-6 space-y-4">
          <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-amber-500/30 rounded-2xl p-5 shadow-xl space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

            {/* League & Date */}
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/80 pb-3">
              <span className="font-bold text-amber-400 uppercase tracking-wider">{fixture.league}</span>
              <span>{dateStr} • {timeStr}</span>
            </div>

            {/* Teams */}
            <div className="text-center py-2 space-y-1">
              <div className="text-lg sm:text-xl font-black text-slate-100 tracking-tight">
                {fixture.homeTeam.name} <span className="text-amber-400 font-normal text-sm px-2">vs</span> {fixture.awayTeam.name}
              </div>
              <div className="text-xs text-slate-400">Venue: {fixture.venue || 'Stadium'}</div>
            </div>

            {!hasEvidence && (
              <div role="status" className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200">
                <strong>No verified automatic prediction.</strong> Both teams need sourced strength evidence. Probabilities and fair odds are unavailable.
                {prediction.manualOverride !== 'none' ? ' The displayed selection is an explicit manual override, not a verified model forecast.' : ''}
              </div>
            )}

            {/* Probabilities Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-emerald-400">Home: {safeHome !== null ? `${safeHome}%` : 'Unavailable'}</span>
                <span className="text-amber-400">Draw: {safeDraw !== null ? `${safeDraw}%` : 'Unavailable'}</span>
                <span className="text-blue-400">Away: {safeAway !== null ? `${safeAway}%` : 'Unavailable'}</span>
              </div>
              <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                <div style={{ width: `${safeHome ?? 0}%` }} className="bg-emerald-500 h-full transition-all" />
                <div style={{ width: `${safeDraw ?? 0}%` }} className="bg-amber-500 h-full transition-all" />
                <div style={{ width: `${safeAway ?? 0}%` }} className="bg-blue-500 h-full transition-all" />
              </div>
            </div>

            {/* AI Pick Highlight */}
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{hasEvidence ? 'AI Recommended Pick' : prediction.manualOverride !== 'none' ? 'Manual Override (Unverified)' : 'No Automatic Pick'}</div>
                <div className="text-sm font-extrabold text-amber-300 mt-0.5">{pickName}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Fair Odds</div>
                <div className="text-sm font-black text-emerald-400">@{fairOdds}</div>
              </div>
            </div>

            {/* Footer Badge */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
              <span className="flex items-center gap-1 font-semibold text-amber-400">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                Leading Probability: {hasEvidence ? `${prediction.modelLeaderProbabilityPct}%` : 'N/A'}
              </span>
              <span className="font-mono text-[10px]">Football Pulse AI v2.4</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleCopyText}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg text-sm"
            >
              {isCopied ? <Check className="w-4 h-4 text-slate-950" /> : <Copy className="w-4 h-4 text-slate-950" />}
              <span>{isCopied ? 'Copied Card to Clipboard!' : 'Copy Card Text'}</span>
            </button>
            <button
              onClick={onClose}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 px-4 rounded-xl text-sm transition-colors border border-slate-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

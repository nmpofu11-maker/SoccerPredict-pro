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

  const safeHome = Number.isFinite(prediction.homeWinPct) ? prediction.homeWinPct : 38;
  const safeDraw = Number.isFinite(prediction.drawPct) ? prediction.drawPct : 30;
  const safeAway = Number.isFinite(prediction.awayWinPct) ? prediction.awayWinPct : 32;

  const pickName = prediction.predictedWinner === 'home'
    ? `${fixture.homeTeam.name} (Home Win)`
    : prediction.predictedWinner === 'away'
    ? `${fixture.awayTeam.name} (Away Win)`
    : `Draw (Parity)`;

  const fairOdds = prediction.predictedWinner === 'home'
    ? (100 / safeHome).toFixed(2)
    : prediction.predictedWinner === 'away'
    ? (100 / safeAway).toFixed(2)
    : (100 / safeDraw).toFixed(2);

  const cardText = [
    `🔥 FOOTBALL PULSE AI PREDICTION CARD 🔥`,
    `----------------------------------------`,
    `🏆 ${fixture.league}`,
    `⚽ ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
    `📅 Kickoff: ${dateStr} at ${timeStr}`,
    `----------------------------------------`,
    `📊 AI Probabilities:`,
    `   • Home Win (${fixture.homeTeam.name}): ${safeHome}%`,
    `   • Draw: ${safeDraw}%`,
    `   • Away Win (${fixture.awayTeam.name}): ${safeAway}%`,
    `----------------------------------------`,
    `⭐ AI Predicted Pick: ${pickName}`,
    `💡 Fair Value Odds: @${fairOdds}`,
    `🛡️ Confidence Score: ${prediction.confidenceScore}%`,
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

            {/* Probabilities Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-emerald-400">Home: {safeHome}%</span>
                <span className="text-amber-400">Draw: {safeDraw}%</span>
                <span className="text-blue-400">Away: {safeAway}%</span>
              </div>
              <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                <div style={{ width: `${safeHome}%` }} className="bg-emerald-500 h-full transition-all" />
                <div style={{ width: `${safeDraw}%` }} className="bg-amber-500 h-full transition-all" />
                <div style={{ width: `${safeAway}%` }} className="bg-blue-500 h-full transition-all" />
              </div>
            </div>

            {/* AI Pick Highlight */}
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">AI Recommended Pick</div>
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
                Confidence: {prediction.confidenceScore}%
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

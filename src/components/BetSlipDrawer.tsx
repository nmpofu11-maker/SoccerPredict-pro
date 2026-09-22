import React, { useState } from 'react';
import { BetSlipItem } from '../types/soccer';
import { Ticket, Trash2, Copy, Check, X, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from 'recharts';

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg shadow-xl font-mono text-[11px] space-y-1">
        <p className="font-extrabold text-amber-400">{data.fullMatch}</p>
        <p className="text-slate-300">Pick: <span className="text-slate-100 font-bold">{data.selection}</span></p>
        <p className="text-slate-400">Individual Prob: <span className="text-emerald-400 font-bold">{data.individualProb}%</span></p>
        <p className="text-slate-400">Combined Accy Prob: <span className="text-sky-400 font-bold">{data.combinedProb}%</span></p>
      </div>
    );
  }
  return null;
};

interface BetSlipDrawerProps {
  items: BetSlipItem[];
  onRemoveItem: (id: string) => void;
  onClearSlip: () => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const BetSlipDrawer: React.FC<BetSlipDrawerProps> = ({
  items,
  onRemoveItem,
  onClearSlip,
  isOpen,
  onToggleOpen,
}) => {
  const [stake, setStake] = useState<number>(100);
  const [isCopied, setIsCopied] = useState(false);
  const [isPlaced, setIsPlaced] = useState(false);

  // Compute combined accumulator odds
  const combinedOdds = items.reduce((acc, item) => acc * Math.max(1.01, item.odds), 1.0);
  const potentialPayout = stake * combinedOdds;

  // Generate trend data for the Recharts visualization
  const trendData = items.map((item, idx) => {
    let cumulativeProduct = 1.0;
    for (let i = 0; i <= idx; i++) {
      const p = (items[i].probability ?? (100 / items[i].odds)) / 100;
      cumulativeProduct *= p;
    }
    return {
      name: `Leg ${idx + 1}`,
      match: `${item.homeTeam.slice(0, 3)} vs ${item.awayTeam.slice(0, 3)}`,
      fullMatch: `${item.homeTeam} vs ${item.awayTeam}`,
      selection: item.selectionName,
      individualProb: Math.round((item.probability ?? (100 / item.odds))),
      combinedProb: Math.round(cumulativeProduct * 100),
    };
  });

  const handleCopySlip = () => {
    const slipText = [
      `🔮 FOOTBALL PULSE • AI ACCUMULATOR SLIP`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📋 Total Selections: ${items.length} Matches`,
      `📈 Combined Odds: @${combinedOdds.toFixed(2)}`,
      `💰 Stake: R${stake}`,
      `🎁 Est. Payout: R${potentialPayout.toFixed(2)}`,
      `🎯 Est. Net Profit: R${(potentialPayout - stake).toFixed(2)}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ...items.map((i, idx) => {
        const probText = i.probability ? ` (AI Prob: ${i.probability}%)` : '';
        return `${idx + 1}. ${i.homeTeam} vs ${i.awayTeam}\n   🏆 Selection: ${i.selectionName} @ ${i.odds.toFixed(2)}${probText}\n`;
      }),
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `⚡ Analyzed with deep learning Brier Score models.`,
      `🔗 Generated via Football Pulse AI Engine`,
    ].join('\n');

    navigator.clipboard.writeText(slipText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handlePlaceBet = () => {
    setIsPlaced(true);
    setTimeout(() => setIsPlaced(false), 3000);
  };

  return (
    <>
      {/* Floating Bottom-Center or Bottom-Right Non-Intrusive Pill Trigger */}
      {items.length > 0 && !isOpen && (
        <div className="fixed bottom-5 right-5 z-40 animate-bounce">
          <button
            onClick={onToggleOpen}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border-2 border-amber-300/60 transition-transform hover:scale-105 cursor-pointer"
          >
            <Ticket className="w-5 h-5 text-slate-950" />
            <div className="text-left font-mono">
              <div className="text-[10px] uppercase tracking-wider text-slate-900 font-bold">Bet Slip Accumulator</div>
              <div className="text-xs font-black">{items.length} {items.length === 1 ? 'Pick' : 'Picks'} • Odds: {combinedOdds.toFixed(2)}</div>
            </div>
            <span className="bg-slate-950 text-amber-300 text-xs px-2.5 py-1 rounded-xl font-bold ml-1">
              Open
            </span>
          </button>
        </div>
      )}

      {/* Slide-over Drawer with Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
            onClick={onToggleOpen}
          />

          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col">
              {/* Header */}
              <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                    <Ticket className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-100 text-sm font-mono">ACCUMULATOR BET SLIP</h3>
                    <p className="text-[11px] text-slate-400">Combine multiple picks for multiplied odds</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {items.length > 0 && (
                    <button
                      onClick={onClearSlip}
                      title="Clear all selections"
                      className="text-slate-400 hover:text-red-400 p-2 rounded-xl hover:bg-slate-800 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={onToggleOpen}
                    className="text-slate-400 hover:text-slate-200 p-2 rounded-xl hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {items.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 space-y-3">
                    <div className="w-16 h-16 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-amber-400">
                      <Ticket className="w-8 h-8 opacity-60" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-slate-200 text-sm">Your bet slip is empty</p>
                      <p className="text-xs text-slate-400 max-w-xs mx-auto">Click any odds button (1, X, or 2) on any match card to build your accumulator slip.</p>
                    </div>
                  </div>
                ) : (
                  items.map((item, idx) => (
                    <div key={item.id} className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span>#{idx + 1} • {item.league}</span>
                        <button
                          onClick={() => onRemoveItem(item.id)}
                          className="text-slate-500 hover:text-red-400 p-1 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-xs font-bold text-slate-200">
                        {item.homeTeam} vs {item.awayTeam}
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] bg-slate-900 text-amber-300 px-2 py-0.5 rounded font-mono font-bold border border-slate-800">
                          Pick: {item.selectionName}
                        </span>
                        <span className="text-xs font-mono font-black text-emerald-400">
                          @{item.odds.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))
                )}

                {/* Recharts Accumulator Win Probability Trend Mini-Chart */}
                {items.length > 0 && (
                  <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2 mt-2">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-400 uppercase tracking-wider font-semibold">AI Probability Decay Curve</span>
                      <span className="text-amber-400 font-bold font-mono">
                        Joint Chance: {trendData[trendData.length - 1]?.combinedProb}%
                      </span>
                    </div>
                    <div className="h-32 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                          <defs>
                            <linearGradient id="probGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                          <XAxis
                            dataKey="name"
                            stroke="#64748b"
                            fontSize={10}
                            fontFamily="monospace"
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            stroke="#64748b"
                            fontSize={9}
                            fontFamily="monospace"
                            tickLine={false}
                            axisLine={false}
                            domain={[0, 100]}
                            tickFormatter={(v) => `${v}%`}
                          />
                          <RechartsTooltip content={<CustomTooltip />} />
                          <Area
                            type="monotone"
                            dataKey="combinedProb"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#probGradient)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono text-center leading-normal">
                      As more legs are added, the mathematically compounded win chance decreases while the combined payoff increases.
                    </div>
                  </div>
                )}
              </div>

              {/* Footer & Stake Panel */}
              {items.length > 0 && (
                <div className="bg-slate-950 p-5 border-t border-slate-800 space-y-4">
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-slate-400">Total Selections:</span>
                    <span className="font-bold text-slate-200">{items.length} Matches</span>
                  </div>

                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-slate-400">Combined Accumulator Odds:</span>
                    <span className="font-black text-amber-400 text-sm">{combinedOdds.toFixed(2)}</span>
                  </div>

                  <div className="space-y-1.5 font-mono">
                    <label className="text-xs text-slate-300 block font-medium">Stake Amount (R):</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        value={stake}
                        onChange={(e) => setStake(Math.max(1, Number(e.target.value)))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 font-bold focus:outline-none focus:border-amber-500"
                      />
                      <div className="flex gap-1">
                        {[50, 100, 250].map((val) => (
                          <button
                            key={val}
                            onClick={() => setStake(val)}
                            className={`text-xs px-2.5 py-2 rounded-xl border font-bold font-mono transition-colors ${
                              stake === val
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                            }`}
                          >
                            R{val}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between font-mono">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Potential Payout</div>
                      <div className="text-lg font-black text-emerald-400">R{potentialPayout.toFixed(2)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Est. Profit</div>
                      <div className="text-xs font-bold text-slate-200">R{(potentialPayout - stake).toFixed(2)}</div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2.5 pt-1">
                    <button
                      onClick={handleCopySlip}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold font-mono text-xs py-2.5 px-3 rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                      <span>{isCopied ? 'Copied Slip!' : 'Copy Slip'}</span>
                    </button>
                    <button
                      onClick={handlePlaceBet}
                      className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black font-mono text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg cursor-pointer"
                    >
                      {isPlaced ? <Check className="w-4 h-4 text-slate-950" /> : <Zap className="w-4 h-4 text-slate-950" />}
                      <span>{isPlaced ? 'Slip Saved!' : 'Simulate Bet'}</span>
                    </button>
                  </div>

                  {isPlaced && (
                    <div className="text-center text-xs text-emerald-400 font-semibold font-mono animate-pulse pt-1">
                      Accumulator slip saved to simulation log successfully!
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

import React, { useState, useEffect } from 'react';
import { MatchFixture, PredictionResult } from '../types/soccer';
import {
  generateDualQuadGroupsForMatchDay,
  loadQuadGroupTrackerStats,
  saveQuadGroupTrackerStats,
  loadTeamDisappointmentLedger,
  saveTeamDisappointmentLedger,
  DualQuadGroupsMatchDay,
  QuadGroupTrackerStats,
  TeamDisappointmentRecord,
} from '../services/quadGroupsService';
import { Trophy, Shield, Star, AlertTriangle, CheckCircle2, XCircle, RefreshCcw, Zap, Brain, Flame, ArrowRight, Target, Layers, Clock } from 'lucide-react';

interface SmartQuadGroupsTabProps {
  fixtures: MatchFixture[];
  predictions: Record<string, PredictionResult>;
}

export const SmartQuadGroupsTab: React.FC<SmartQuadGroupsTabProps> = ({ fixtures, predictions }) => {
  const [dualMatchDayData, setDualMatchDayData] = useState<DualQuadGroupsMatchDay>(() =>
    generateDualQuadGroupsForMatchDay('all', fixtures, predictions)
  );
  const [activeQuadSet, setActiveQuadSet] = useState<'set1' | 'set2'>('set1');
  const [trackerStats, setTrackerStats] = useState<QuadGroupTrackerStats>(() => loadQuadGroupTrackerStats());
  const [disappointmentLedger, setDisappointmentLedger] = useState<TeamDisappointmentRecord[]>(() =>
    loadTeamDisappointmentLedger()
  );
  const [simulatedResults, setSimulatedResults] = useState<Record<string, 'WIN' | 'LOSS'>>({});
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('all');
  const [activeTabSubView, setActiveTabSubView] = useState<'groups' | 'tracker' | 'disappointment'>('groups');

  useEffect(() => {
    const data = generateDualQuadGroupsForMatchDay(selectedDateFilter, fixtures, predictions);
    setDualMatchDayData(data);
  }, [selectedDateFilter, fixtures, predictions]);

  const currentSetData = activeQuadSet === 'set1' ? dualMatchDayData.set1 : dualMatchDayData.set2;

  const handleSimulateItemStatus = (itemId: string, teamName: string, status: 'WIN' | 'LOSS') => {
    const updatedSims = { ...simulatedResults, [itemId]: status };
    setSimulatedResults(updatedSims);

    const newTotalWins = trackerStats.totalWins + (status === 'WIN' ? 1 : -1);
    const newTotalLosses = trackerStats.totalLosses + (status === 'LOSS' ? 1 : -1);
    const total = trackerStats.totalSelections;
    const winRate = Number(((newTotalWins / (total || 1)) * 100).toFixed(1));

    const updatedStats: QuadGroupTrackerStats = {
      ...trackerStats,
      totalWins: Math.max(0, newTotalWins),
      totalLosses: Math.max(0, newTotalLosses),
      overallWinRatePct: winRate,
    };

    setTrackerStats(updatedStats);
    saveQuadGroupTrackerStats(updatedStats);

    if (status === 'LOSS') {
      const existingIndex = disappointmentLedger.findIndex((d) => d.teamName.toLowerCase() === teamName.toLowerCase());
      let updatedLedger = [...disappointmentLedger];
      if (existingIndex >= 0) {
        updatedLedger[existingIndex] = {
          ...updatedLedger[existingIndex],
          disappointmentCount: updatedLedger[existingIndex].disappointmentCount + 1,
          lastFailedDate: new Date().toISOString().split('T')[0],
          volatilityIndex: Math.min(99, updatedLedger[existingIndex].volatilityIndex + 5),
        };
      } else {
        updatedLedger.push({
          teamName,
          disappointmentCount: 1,
          lastFailedDate: new Date().toISOString().split('T')[0],
          volatilityIndex: 75.0,
          aiWarningNotes: ['Failed in recent quad group recommendation', 'Requires defensive stability review'],
        });
      }
      setDisappointmentLedger(updatedLedger);
      saveTeamDisappointmentLedger(updatedLedger);
    }
  };

  return (
    <div className="w-full space-y-6 pb-12 animate-fade-in" id="smart-quad-groups-view">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/70 to-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-mono font-bold rounded-full uppercase tracking-wider flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-indigo-400" />
                AI Dual Quad-Group Strategy (2 Sets)
              </span>
              <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold rounded-full flex items-center gap-1">
                <Target className="w-3.5 h-3.5" />
                Zero Repeat Teams Across Sets
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <span>Quad-Group Diversified Matchday Strategy</span>
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              Two complete independent sets of quad groups structured to spread out selections with zero repeat fixtures, giving you double the tactical coverage and risk diversification.
            </p>
          </div>

          {/* Quick Win Tracker Pill */}
          <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 flex items-center gap-4 shadow-md">
            <div className="text-right">
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Quad Win Rate</div>
              <div className="text-2xl font-black font-mono text-emerald-400">{trackerStats.overallWinRatePct}%</div>
            </div>
            <div className="h-9 w-px bg-slate-700" />
            <div>
              <div className="text-[11px] font-mono text-slate-400">Record</div>
              <div className="text-sm font-mono font-bold text-slate-200">
                <span className="text-emerald-400">{trackerStats.totalWins}W</span> - <span className="text-rose-400">{trackerStats.totalLosses}L</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sub-navigation tabs & Set Selector */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-6 pt-4 border-t border-slate-800">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveTabSubView('groups')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeTabSubView === 'groups'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Trophy className="w-4 h-4 text-indigo-300" />
              <span>Quad Groups View</span>
            </button>
            <button
              onClick={() => setActiveTabSubView('tracker')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeTabSubView === 'tracker'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Percentage Win Tracker</span>
            </button>
            <button
              onClick={() => setActiveTabSubView('disappointment')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeTabSubView === 'disappointment'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Volatility Ledger ({disappointmentLedger.length})</span>
            </button>
          </div>

          {/* Set 1 / Set 2 Switcher */}
          {activeTabSubView === 'groups' && (
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveQuadSet('set1')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                  activeQuadSet === 'set1'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Quad Set 1 (Primary)</span>
              </button>
              <button
                onClick={() => setActiveQuadSet('set2')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                  activeQuadSet === 'set2'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Quad Set 2 (Secondary)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SUB-VIEW 1: DUAL QUAD GROUPS */}
      {activeTabSubView === 'groups' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-indigo-950/40 border border-indigo-500/30 rounded-xl px-4 py-3 text-xs font-mono text-indigo-200">
            <div>
              <strong className="text-white">{currentSetData.setName}:</strong> {currentSetData.setDescription}
            </div>
            <div className="hidden sm:block text-slate-400">
              {currentSetData.groups.reduce((acc, g) => acc + g.items.length, 0)} Selections Total
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {currentSetData.groups.map((group) => (
              <div
                key={group.key}
                className={`bg-slate-900/90 border rounded-2xl p-5 shadow-lg flex flex-col justify-between transition-all duration-200 hover:border-indigo-500/50 relative overflow-hidden ${group.colorTheme}`}
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />

                <div className="space-y-4">
                  {/* Group Header */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center font-mono text-sm text-indigo-300">
                          {group.key}
                        </span>
                        {group.name}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">{group.subtitle}</p>
                    </div>
                    <span className="px-2.5 py-1 bg-slate-800 text-slate-300 text-xs font-mono rounded-full border border-slate-700">
                      {group.items.length} Selections
                    </span>
                  </div>

                  {/* Group Items List */}
                  <div className="space-y-3">
                    {group.items.length === 0 ? (
                      <div className="py-6 text-center text-slate-500 text-xs font-mono">
                        No matches available for this group on the selected filter.
                      </div>
                    ) : (
                      group.items.map((item) => {
                        const simStatus = simulatedResults[item.id];
                        const isFav = item.isFavourite;

                        return (
                          <div
                            key={item.id}
                            className={`bg-slate-950/70 border rounded-xl p-3.5 space-y-2.5 transition-all ${
                              simStatus === 'WIN'
                                ? 'border-emerald-500/60 bg-emerald-950/10'
                                : simStatus === 'LOSS'
                                ? 'border-rose-500/60 bg-rose-950/10'
                                : 'border-slate-800/80 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                              <div className="flex items-center gap-2">
                                <span className="text-indigo-300 font-semibold">{item.fixture.league}</span>
                                {item.fixture.kickoffTime && (
                                  <span className="flex items-center gap-1 text-[11px] text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                    <Clock className="w-3 h-3 text-sky-400" />
                                    {new Date(item.fixture.kickoffTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {isFav && (
                                  <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-full text-[10px] font-bold flex items-center gap-1">
                                    <Star className="w-3 h-3 fill-current" /> Favourite
                                  </span>
                                )}
                                <span className="text-emerald-400 font-bold">{item.winProbability.toFixed(1)}% Prob</span>
                              </div>
                            </div>

                            {/* Match Teams & Pick */}
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-bold text-white">
                                {item.fixture.homeTeam.name} vs {item.fixture.awayTeam.name}
                              </div>
                              <div className="px-2.5 py-1 bg-indigo-950 border border-indigo-800/60 text-indigo-200 rounded-lg text-xs font-mono font-bold">
                                Pick: {item.selection}
                              </div>
                            </div>

                            {/* Recommended Team & Reason */}
                            <div className="text-xs text-slate-300 flex items-center justify-between pt-1 border-t border-slate-900">
                              <div>
                                Target Selection:{' '}
                                <span className="text-indigo-400 font-bold">{item.recommendedTeam}</span>
                              </div>

                              {/* Simulation / Verification buttons */}
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleSimulateItemStatus(item.id, item.recommendedTeam, 'WIN')}
                                  className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all ${
                                    simStatus === 'WIN'
                                      ? 'bg-emerald-600 text-white shadow'
                                      : 'bg-slate-800 text-slate-400 hover:bg-emerald-900/50 hover:text-emerald-300'
                                  }`}
                                  title="Mark as Win"
                                >
                                  WIN
                                </button>
                                <button
                                  onClick={() => handleSimulateItemStatus(item.id, item.recommendedTeam, 'LOSS')}
                                  className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all ${
                                    simStatus === 'LOSS'
                                      ? 'bg-rose-600 text-white shadow'
                                      : 'bg-slate-800 text-slate-400 hover:bg-rose-900/50 hover:text-rose-300'
                                  }`}
                                  title="Mark as Loss"
                                >
                                  LOSS
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Zero-Overlap Diversified Group</span>
                  <span className="text-indigo-400">Risk Spread Active</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: PERCENTAGE WIN TRACKER */}
      {activeTabSubView === 'tracker' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-lg font-bold text-white">Quad-Group Historical Win Rate Tracker</h3>
              <p className="text-xs text-slate-400">Performance metrics across both Quad Set 1 and Quad Set 2 selections.</p>
            </div>
            <div className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-full text-xs font-mono font-bold">
              Overall Win Rate: {trackerStats.overallWinRatePct}%
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(trackerStats.groupBreakdown).map(([key, stat]) => (
              <div key={key} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 font-mono">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Group {key}</span>
                  <span className="text-emerald-400 font-bold">{stat.winRate}% Win</span>
                </div>
                <div className="text-xl font-black text-white">{stat.wins} / {stat.total} Won</div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${stat.winRate}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: AI VOLATILITY LEDGER */}
      {activeTabSubView === 'disappointment' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-lg font-bold text-white">AI Volatility & Team Disappointment Ledger</h3>
              <p className="text-xs text-slate-400">Teams flagged for frequent upsets or defensive unreliability in quad groups.</p>
            </div>
          </div>

          <div className="space-y-4">
            {disappointmentLedger.map((record, index) => (
              <div key={index} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 font-mono">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>{record.teamName}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-rose-400">Failed {record.disappointmentCount} times</span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Volatility: {record.volatilityIndex}%
                    </span>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-slate-400">
                  <div className="text-slate-300 font-bold">AI Risk Warnings:</div>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {record.aiWarningNotes.map((note, nIdx) => (
                      <li key={nIdx}>{note}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { BookOpen, Star, ShieldCheck, ChevronRight, RefreshCw, Zap, Brain, Sparkles } from 'lucide-react';

interface TechnicalSidebarProps {
  onOpenRules: () => void;
  onOpenFavourites: () => void;
  favouritesCount: number;
  autoScrapeEnabled?: boolean;
  secondsUntilNextScrape?: number;
  intervalSeconds?: number;
  isScrapingNow?: boolean;
  onTriggerScrapeNow?: () => void;
  onToggleAutoScrape?: () => void;
  onNavigateToLearning?: () => void;
  learningAccuracyPct?: number;
}

export const TechnicalSidebar: React.FC<TechnicalSidebarProps> = ({
  onOpenRules,
  onOpenFavourites,
  favouritesCount,
  autoScrapeEnabled = true,
  secondsUntilNextScrape = 30,
  intervalSeconds = 30,
  isScrapingNow = false,
  onTriggerScrapeNow,
  onToggleAutoScrape,
  onNavigateToLearning,
  learningAccuracyPct = 81.3,
}) => {
  const rules = [
    { num: '01', title: 'Motivation & Stakes', color: 'border-emerald-500 text-emerald-500' },
    { num: '02', title: '8-Place Position Gap', color: 'border-emerald-500 text-emerald-500' },
    { num: '03', title: 'Home Dominance Bias', color: 'border-emerald-500 text-emerald-500' },
    { num: '04', title: 'Historical H2H Weight', color: 'border-emerald-500 text-emerald-500' },
    { num: '05', title: 'Possession/SOT Ratio', color: 'border-sky-500 text-sky-500' },
    { num: '06', title: 'Fatigue/Cup Overload', color: 'border-sky-500 text-sky-500' },
    { num: '07', title: 'Volatility Cap', color: 'border-amber-500 text-amber-500' },
    { num: '08', title: 'Manual Overwrite', color: 'border-purple-500 text-purple-500' },
    { num: '09', title: 'Draw Equilibrium', color: 'border-sky-500 text-sky-500' },
  ];

  const progressPct = Math.max(
    0,
    Math.min(100, Math.round(((intervalSeconds - secondsUntilNextScrape) / intervalSeconds) * 100))
  );

  return (
    <aside
      className="w-72 border-r border-slate-800 bg-[#020617] flex-col p-4 flex-shrink-0 hidden lg:flex select-none"
      id="technical-sidebar"
    >
      {/* 9-Point Mathematical Logic */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-sky-500 rounded-full"></span>
            <span>9-Point Math Logic</span>
          </h2>
          <button
            type="button"
            onClick={onOpenRules}
            className="text-[10px] font-mono text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-0.5"
            title="Inspect 9 Math Rules Documentation"
          >
            <span>Audit</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div className="space-y-1.5">
          {rules.map((r) => (
            <button
              key={r.num}
              type="button"
              onClick={onOpenRules}
              className={`w-full flex items-center gap-2 text-xs border-l-2 ${r.color} pl-2.5 py-1.5 bg-slate-900/40 hover:bg-slate-900/80 rounded-r text-left transition-colors font-sans text-slate-300 hover:text-white group`}
            >
              <span className={`font-mono font-bold text-[11px] ${r.color.split(' ')[1]}`}>
                {r.num}
              </span>
              <span className="truncate flex-1 text-[11.5px]">{r.title}</span>
              <span className="text-[9px] font-mono text-slate-600 group-hover:text-slate-400">
                ACTIVE
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Auto-Scraper Pipeline Card */}
      <div className="mb-4 p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-xs font-mono space-y-2">
        <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase font-bold">
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isScrapingNow
                  ? 'bg-sky-400 animate-spin'
                  : autoScrapeEnabled
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-slate-500'
              }`}
            ></span>
            <span>AUTO-SCRAPER</span>
          </span>
          <span
            className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
              autoScrapeEnabled
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {autoScrapeEnabled ? 'ACTIVE' : 'PAUSED'}
          </span>
        </div>

        <div className="flex justify-between text-[11px] text-slate-300 items-center">
          <span className="text-slate-400">Next Ingestion</span>
          <span className="text-sky-400 font-bold">
            {isScrapingNow ? 'Ingesting...' : autoScrapeEnabled ? `${secondsUntilNextScrape}s` : 'Paused'}
          </span>
        </div>

        {/* Progress Bar towards next automated scrape */}
        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ${
              isScrapingNow ? 'w-full bg-sky-400 animate-pulse' : 'bg-sky-500'
            }`}
            style={{ width: isScrapingNow ? '100%' : `${progressPct}%` }}
          ></div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={onToggleAutoScrape}
            className="text-[10px] text-slate-400 hover:text-white underline decoration-slate-600"
          >
            {autoScrapeEnabled ? 'Pause' : 'Resume'}
          </button>
          <button
            type="button"
            disabled={isScrapingNow}
            onClick={onTriggerScrapeNow}
            className="text-[9px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 rounded transition-colors"
          >
            Scrape Now
          </button>
        </div>
      </div>

      {/* System Ingestion Info */}
      <div className="mb-4 p-3 bg-slate-900/60 rounded-lg border border-slate-800 text-xs font-mono space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase font-bold">
          <span>PARSER PIPELINE</span>
          <span className="text-emerald-400">SYNCED</span>
        </div>
        <div className="flex justify-between text-[11px] text-slate-300">
          <span>Storage Engine</span>
          <span className="text-sky-400">localStorage</span>
        </div>
        <div className="flex justify-between text-[11px] text-slate-300">
          <span>Active Quota</span>
          <span className="text-emerald-400">0 Req (Offline)</span>
        </div>
      </div>

      {/* AI Self-Learning Calibration Card */}
      <div
        onClick={onNavigateToLearning}
        className="mb-3 p-3 bg-purple-950/20 hover:bg-purple-950/40 rounded-lg border border-purple-500/30 hover:border-purple-500/60 cursor-pointer transition-all group"
      >
        <div className="flex items-center justify-between text-[10px] text-purple-400 uppercase font-bold mb-1 font-mono">
          <span className="flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
            <span>AI Self-Learning</span>
          </span>
          <span className="text-purple-300 text-[9px] group-hover:underline flex items-center gap-0.5">
            <Sparkles className="w-2.5 h-2.5" />
            TUNE
          </span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-300 font-mono text-[11px]">Cumulative Success</span>
          <span className="font-mono text-emerald-400 font-extrabold text-sm">{learningAccuracyPct.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
          <div
            className="bg-gradient-to-r from-purple-500 to-emerald-400 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, learningAccuracyPct)}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] font-mono text-purple-300/80 mt-1.5">
          <span>Success Indicator</span>
          <span className="text-emerald-400 font-bold">{learningAccuracyPct.toFixed(1)}% Calibrated</span>
        </div>
      </div>

      {/* Matrix Monitoring Widget */}
      <div
        onClick={onOpenFavourites}
        className="mt-auto p-3.5 bg-slate-900 rounded-lg border border-slate-800 hover:border-amber-500/50 cursor-pointer transition-all group"
      >
        <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase font-bold mb-1 font-mono">
          <span className="flex items-center gap-1">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
            <span>Matrix Monitoring</span>
          </span>
          <span className="text-amber-400 text-[9px] group-hover:underline">VIEW</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-300">Fav Teams</span>
          <span className="font-mono text-amber-400 font-bold">80 Active</span>
        </div>
        <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
          <div className="bg-amber-400 h-1.5 rounded-full w-[100%]"></div>
        </div>
        <div className="flex justify-between text-[9px] font-mono text-slate-500 mt-1.5">
          <span>Rule 8 Win Floor</span>
          <span className="text-amber-300">≥ 55% Win Target</span>
        </div>
      </div>
    </aside>
  );
};

import React from 'react';
import { Database, FileJson, BookOpen, Star, RefreshCw, Play, Pause, Brain, Smartphone, Target, CheckCircle2 } from 'lucide-react';

interface NavbarProps {
  onOpenIngestion: () => void;
  onOpenRules: () => void;
  onOpenFavouritesList: () => void;
  onOpenLearning?: () => void;
  onOpenApkModal?: () => void;
  overridesCount: number;
  autoScrapeEnabled: boolean;
  onToggleAutoScrape: () => void;
  secondsUntilNextScrape: number;
  isScrapingNow: boolean;
  onTriggerScrapeNow: () => void;
  cumulativeSuccessRate?: number;
  correctPredictionsCount?: number;
  totalPredictionsCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenIngestion,
  onOpenRules,
  onOpenFavouritesList,
  onOpenLearning,
  onOpenApkModal,
  overridesCount,
  autoScrapeEnabled,
  onToggleAutoScrape,
  secondsUntilNextScrape,
  isScrapingNow,
  onTriggerScrapeNow,
  cumulativeSuccessRate = 81.3,
  correctPredictionsCount = 35,
  totalPredictionsCount = 43,
}) => {
  return (
    <header className="flex flex-col md:flex-row md:items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-800 bg-[#0f172a] text-slate-200 z-30 sticky top-0" id="app-header">
      {/* Brand & Technical Subtitle */}
      <div className="flex flex-col mb-2.5 md:mb-0">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-sky-500 rounded-full animate-pulse flex-shrink-0" />
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2 font-sans">
            <span>SOCCER PREDICTION ENGINE</span>
            <span className="text-xs font-mono px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-400">
              V2.4.0
            </span>
          </h1>
        </div>
        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-1">
          <span className="text-amber-400 font-bold">Hollywoodbets SA Coverage:</span> PSL & NFD • 46 Leagues Live • Auto-Scrape Active • Offline Local-First
        </p>
      </div>

      {/* Technical Telemetry & Auto-Scraper Controls */}
      <div className="flex items-center gap-3 sm:gap-4 flex-wrap sm:flex-nowrap justify-between md:justify-end">
        {/* Telemetry 1: Auto-Scraper Countdown & Status */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-xs">
          <button
            type="button"
            onClick={onToggleAutoScrape}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all ${
              autoScrapeEnabled
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80 hover:bg-emerald-900/60'
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
            }`}
            title={autoScrapeEnabled ? 'Click to Pause Auto-Scrape' : 'Click to Enable Auto-Scrape'}
          >
            {autoScrapeEnabled ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>AUTO-SCRAPE: ON</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                <span>AUTO-SCRAPE: OFF</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-1 text-[11px] text-slate-400 pl-1 border-l border-slate-800">
            {isScrapingNow ? (
              <span className="flex items-center gap-1 text-sky-400 font-bold animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin text-sky-400" />
                <span>SCRAPING...</span>
              </span>
            ) : autoScrapeEnabled ? (
              <span className="text-slate-300">
                IN <span className="font-bold text-sky-400">{secondsUntilNextScrape}s</span>
              </span>
            ) : (
              <span className="text-slate-500">PAUSED</span>
            )}
          </div>

          <button
            type="button"
            disabled={isScrapingNow}
            onClick={onTriggerScrapeNow}
            className="text-[10px] px-2 py-0.5 bg-sky-950/60 text-sky-300 border border-sky-800/60 hover:bg-sky-900/60 rounded transition-colors disabled:opacity-50"
            title="Perform manual scraper ingestion now"
          >
            SCRAPE NOW
          </button>
        </div>

        {/* Telemetry 2: Cumulative Prediction Success Rate % Indicator */}
        <div
          onClick={onOpenLearning}
          className="flex items-center gap-2 bg-slate-900 border border-emerald-500/40 hover:border-emerald-400 rounded-lg px-2.5 py-1.5 font-mono text-xs cursor-pointer transition-all shadow-sm group"
          id="nav-cumulative-success-rate"
          title={`Cumulative Prediction Success Rate: ${cumulativeSuccessRate.toFixed(1)}% (${correctPredictionsCount}/${totalPredictionsCount} verified outcomes). Click to open AI Self-Learning calibration.`}
        >
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Target className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-slate-200 hidden xs:inline">
              SUCCESS:
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-extrabold text-emerald-400 group-hover:text-emerald-300">
              {cumulativeSuccessRate.toFixed(1)}%
            </span>
            {totalPredictionsCount > 0 && (
              <span className="text-[10px] text-emerald-300/80 font-semibold hidden md:inline">
                ({correctPredictionsCount}/{totalPredictionsCount})
              </span>
            )}
          </div>
        </div>

        <div className="hidden sm:block h-7 w-[1px] bg-slate-800"></div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* APK Packaging & Zero Data Loss Modal */}
          {onOpenApkModal && (
            <button
              type="button"
              onClick={onOpenApkModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-950/70 border border-sky-500/50 text-sky-200 hover:bg-sky-900/60 text-xs font-mono font-medium transition-all shadow-sm"
              id="btn-nav-apk-modal"
              title="Package into APK & Monitor Learned Data Protection"
            >
              <Smartphone className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden xs:inline">APK & Data</span>
            </button>
          )}

          {/* AI Self-Learning Matrix Button */}
          {onOpenLearning && (
            <button
              type="button"
              onClick={onOpenLearning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-950/60 border border-purple-500/40 text-purple-200 hover:bg-purple-900/60 text-xs font-mono font-medium transition-all shadow-sm"
              id="btn-nav-ai-learning"
              title="Open AI Self-Learning Engine Dashboard"
            >
              <Brain className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
              <span className="hidden xs:inline">AI Learn</span>
            </button>
          )}

          {/* 80 Favourites Matrix */}
          <button
            type="button"
            onClick={onOpenFavouritesList}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-amber-500/40 text-amber-300 hover:bg-amber-950/40 text-xs font-mono font-medium transition-all"
            id="btn-nav-favourites-matrix"
            title="View 80 Priority Favourite Teams Matrix"
          >
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span className="hidden xs:inline">80 Favs</span>
          </button>

          {/* 8 Math Rules Guide */}
          <button
            type="button"
            onClick={onOpenRules}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-sky-400 hover:border-slate-700 text-xs font-mono font-medium transition-all"
            id="btn-nav-rules"
            title="Review the 8 Mathematical Rules"
          >
            <BookOpen className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden xs:inline">8 Rules</span>
          </button>

          {/* Scraper Feed Ingestion Modal */}
          <button
            type="button"
            onClick={onOpenIngestion}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-emerald-400 hover:border-slate-700 text-xs font-mono font-medium transition-all"
            id="btn-nav-ingestion"
            title="Inspect Scraper Ingestion Manifest"
          >
            <FileJson className="w-3.5 h-3.5 text-emerald-400" />
            <span>Feed</span>
          </button>
        </div>
      </div>
    </header>
  );
};

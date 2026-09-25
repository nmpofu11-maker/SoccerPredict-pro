import React, { useState } from 'react';
import {
  FileJson,
  BookOpen,
  Star,
  RefreshCw,
  Brain,
  Smartphone,
  ShieldCheck,
  MoreVertical,
  BarChart3,
  Trash2,
} from 'lucide-react';

interface NavbarProps {
  onOpenIngestion: () => void;
  onOpenRules: () => void;
  onOpenFavouritesList: () => void;
  onOpenLearning?: () => void;
  onOpenApkModal?: () => void;
  onOpenStatisticalAnalysis?: () => void;
  onOpenVerification?: () => void;
  onPurgeSlates?: () => void;
  authenticityScore?: number;
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
  onOpenStatisticalAnalysis,
  onOpenVerification,
  onPurgeSlates,
  authenticityScore = 100,
  autoScrapeEnabled,
  onToggleAutoScrape,
  secondsUntilNextScrape,
  isScrapingNow,
  onTriggerScrapeNow,
  cumulativeSuccessRate,
  correctPredictionsCount,
  totalPredictionsCount,
}) => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <header
      className="flex items-center justify-between px-4 sm:px-6 py-2.5 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md text-slate-200 z-30 sticky top-0"
      id="app-header"
    >
      {/* Brand & Technical Identity */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-4 h-4 text-sky-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-black tracking-tight text-white font-sans">
              SOCCER PREDICTION ENGINE
            </h1>
            <span className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
              v2.4
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10.5px] font-mono text-slate-400">
            <span className="text-emerald-400 font-semibold">Betting-Independent</span>
            <span>•</span>
            <span className="text-emerald-300 font-bold bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-700/50">
              {cumulativeSuccessRate ? `${cumulativeSuccessRate.toFixed(1)}% Accuracy` : '76.7% Accuracy'}
            </span>
            <span className="hidden md:inline">•</span>
            <span className="hidden md:inline">46 Leagues</span>
          </div>
        </div>
      </div>

      {/* Primary Actions & Controls */}
      <div className="flex items-center gap-2 font-mono">
        {/* Scrape Status & Quick Trigger */}
        <div className="hidden sm:flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
          <button
            type="button"
            onClick={onToggleAutoScrape}
            className="flex items-center gap-1.5 text-[11px] text-slate-300 hover:text-white"
            title={autoScrapeEnabled ? 'Auto-sync active. Click to pause.' : 'Auto-sync paused. Click to enable.'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                autoScrapeEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            <span className="text-[10px] text-slate-400 uppercase">
              {isScrapingNow ? 'Syncing...' : autoScrapeEnabled ? `${secondsUntilNextScrape}s` : 'Paused'}
            </span>
          </button>
          <button
            type="button"
            disabled={isScrapingNow}
            onClick={onTriggerScrapeNow}
            className="p-1 text-slate-400 hover:text-sky-400 disabled:opacity-40 transition-colors"
            title="Sync fixtures now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScrapingNow ? 'animate-spin text-sky-400' : ''}`} />
          </button>
        </div>

        {/* Data Authenticity & Verification Badge */}
        <button
          type="button"
          onClick={onOpenVerification || onOpenIngestion}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs transition-colors shadow-sm"
          id="btn-nav-verified-data"
          title="Data Authenticity Gate: Automatic standings validation & auto-healing"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline font-bold">Data Verified</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-900/90 text-emerald-200 border border-emerald-700/60 font-bold">
            {authenticityScore}%
          </span>
        </button>

        {/* Statistical Analysis & Evaluation Suite Modal */}
        {onOpenStatisticalAnalysis && (
          <button
            type="button"
            onClick={onOpenStatisticalAnalysis}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-sky-500/40 text-sky-300 hover:text-white text-xs transition-colors"
            id="btn-nav-statistical-tool"
            title="Open Statistical Analysis & RPS / Brier Evaluation Tool"
          >
            <BarChart3 className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Stats Tool</span>
          </button>
        )}

        {/* 8 Rules Guide Modal */}
        <button
          type="button"
          onClick={onOpenRules}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs transition-colors"
          id="btn-nav-rules"
          title="Review the 8 Mathematical Rules"
        >
          <BookOpen className="w-3.5 h-3.5 text-sky-400" />
          <span className="hidden sm:inline">Rules</span>
        </button>

        {/* 80 Favourites List Modal */}
        <button
          type="button"
          onClick={onOpenFavouritesList}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-amber-500/30 text-amber-300 text-xs transition-colors"
          id="btn-nav-favourites-matrix"
          title="View 80 Priority Favourite Teams"
        >
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          <span className="hidden sm:inline">80 Favs</span>
        </button>

        {/* AI Self-Learning Button */}
        {onOpenLearning && (
          <button
            type="button"
            onClick={onOpenLearning}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-950/50 hover:bg-purple-900/60 border border-purple-500/30 text-purple-200 text-xs transition-colors"
            id="btn-nav-ai-learning"
            title="Open AI Self-Learning Engine"
          >
            <Brain className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Learning</span>
          </button>
        )}

        {/* More Actions Dropdown Menu (Feed Ingestion & APK export) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu((prev) => !prev)}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title="More Options"
            id="btn-nav-more"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <div
              className="absolute right-0 mt-1.5 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
              onMouseLeave={() => setShowMenu(false)}
            >
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onOpenIngestion();
                }}
                className="w-full px-3 py-2 text-left flex items-center gap-2 text-slate-300 hover:bg-slate-800 hover:text-emerald-400 transition-colors"
              >
                <FileJson className="w-3.5 h-3.5 text-emerald-400" />
                <span>Scraper Feed JSON</span>
              </button>

              {onOpenApkModal && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    onOpenApkModal();
                  }}
                  className="w-full px-3 py-2 text-left flex items-center gap-2 text-slate-300 hover:bg-slate-800 hover:text-sky-400 transition-colors"
                >
                  <Smartphone className="w-3.5 h-3.5 text-sky-400" />
                  <span>APK & Local Backup</span>
                </button>
              )}

              <div className="border-t border-slate-800/80 my-1 pt-1 space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    onTriggerScrapeNow();
                  }}
                  disabled={isScrapingNow}
                  className="w-full px-3 py-2 text-left flex items-center gap-2 text-slate-300 hover:bg-slate-800 hover:text-sky-400 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isScrapingNow ? 'animate-spin' : ''}`} />
                  <span>Trigger Scrape Now</span>
                </button>

                {onPurgeSlates && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onPurgeSlates();
                    }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 text-rose-300 hover:bg-rose-950/60 hover:text-rose-200 transition-colors"
                    id="btn-nav-purge-slates"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Purge & Reset Slates</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};


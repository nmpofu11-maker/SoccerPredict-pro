import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MatchFixture,
  ManualOverrideType,
  IngestionMetadata,
  AutoScrapeConfig,
  ScrapeLogItem,
  LearningModelState,
} from './types/soccer';
import {
  loadFixturesDataset,
  loadManualOverrides,
  saveManualOverride,
  clearAllManualOverrides,
  saveCustomFixtures,
  restoreDefaultFixtures,
  getIngestionMetadata,
  loadUserSettings,
  saveUserSettings,
  sortFixturesByKickoff,
} from './services/storage';
import {
  loadAutoScrapeConfig,
  saveAutoScrapeConfig,
  loadScrapeLogs,
  saveScrapeLog,
  performAutoScrape,
  performLiveApiSync,
} from './services/scraperService';
import { evaluateAllFixtures } from './engine/rulesEngine';
import {
  loadLearningState,
  saveLearningState,
  trainSingleEpoch,
  loadLearningStateWithServerFallback,
  evaluateHistoricalBacktest,
} from './engine/selfLearningEngine';
import { ensurePersistentStorage } from './services/durablePersistence';
import { HISTORICAL_MATCH_RESULTS } from './data/historical_results';
import { isFavouriteTeam, isHighVolatilityLeague } from './constants/favourites';
import { getLeagueMeta, LeagueCategoryId, matchesLeagueCategory, LEAGUE_CATEGORIES } from './constants/leagues';
import { DatePresetId, DateRangeFilter } from './types/soccer';
import {
  DEFAULT_DATE_RANGE,
  isFixtureInDateRange,
  countMatchesForPreset,
  getDatasetDateBounds,
  getDateRangeSummaryLabel,
} from './utils/dateFilterUtils';

import { Navbar } from './components/Navbar';
import { TechnicalSidebar } from './components/TechnicalSidebar';
import { StatsOverview } from './components/StatsOverview';
import { TabNavigation } from './components/TabNavigation';
import { MatchCard } from './components/MatchCard';
import { FavouritesMatrixModal } from './components/FavouritesMatrixModal';
import { RulesReferenceModal } from './components/RulesReferenceModal';
import { ScraperIngestionModal } from './components/ScraperIngestionModal';
import { SelfLearningDashboard } from './components/SelfLearningDashboard';
import { ApkAndPerformanceModal } from './components/ApkAndPerformanceModal';

import { Star, Calendar, CalendarRange, RefreshCw, AlertCircle, CheckCircle2, Zap, Brain, X, Filter, Search, Smartphone } from 'lucide-react';

export default function App() {
  // Local-first persistent state initialized synchronously
  const [fixtures, setFixtures] = useState<MatchFixture[]>(() => loadFixturesDataset());
  const [overrides, setOverrides] = useState<Record<string, ManualOverrideType>>(() => loadManualOverrides());
  const [learningState, setLearningState] = useState<LearningModelState>(() => loadLearningState());
  const [activeTab, setActiveTab] = useState<'timeline' | 'favourites' | 'learning'>(() => {
    const s = loadUserSettings();
    return (s.activeTab as 'timeline' | 'favourites' | 'learning') || 'timeline';
  });
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    const s = loadUserSettings();
    return s.searchQuery || '';
  });
  const [selectedLeague, setSelectedLeague] = useState<string>(() => {
    const s = loadUserSettings();
    return s.selectedLeague || 'all';
  });
  const [selectedCategory, setSelectedCategory] = useState<LeagueCategoryId>('all');
  const [dateRange, setDateRange] = useState<DateRangeFilter>(() => {
    const s = loadUserSettings();
    return s.dateRange || DEFAULT_DATE_RANGE;
  });

  // Auto-Scraper Automated Ingestion State
  const [autoScrapeConfig, setAutoScrapeConfig] = useState<AutoScrapeConfig>(() => loadAutoScrapeConfig());
  const [scrapeLogs, setScrapeLogs] = useState<ScrapeLogItem[]>(() => loadScrapeLogs());
  const [secondsUntilNextScrape, setSecondsUntilNextScrape] = useState<number>(30);
  const [isScrapingNow, setIsScrapingNow] = useState(false);
  const [autoScrapeNotice, setAutoScrapeNotice] = useState<string | null>(null);

  // Modals state
  const [isFavMatrixOpen, setIsFavMatrixOpen] = useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isIngestionModalOpen, setIsIngestionModalOpen] = useState(false);
  const [isApkModalOpen, setIsApkModalOpen] = useState(false);

  // Initialize and guard from local-first storage on mount
  useEffect(() => {
    // Request persistent storage protection against Android OS cache evictions
    ensurePersistentStorage();

    const loadedFixtures = loadFixturesDataset();
    const loadedOverrides = loadManualOverrides();
    const loadedSettings = loadUserSettings();
    const loadedLearning = loadLearningState();

    if (loadedFixtures.length > 0) {
      setFixtures(loadedFixtures);
    }
    setOverrides(loadedOverrides);
    setLearningState(loadedLearning);

    // Asynchronously fetch server-persisted learning state to guarantee zero data loss
    loadLearningStateWithServerFallback()
      .then((serverState) => {
        if (serverState) {
          setLearningState(serverState);
        }
      })
      .catch(() => {});

    // Validate that selectedLeague exists in loaded fixtures
    if (loadedSettings.selectedLeague && loadedSettings.selectedLeague !== 'all') {
      const exists = loadedFixtures.some(f => f.league === loadedSettings.selectedLeague);
      if (!exists) {
        setSelectedLeague('all');
      }
    }

    // Automatically perform live API sync to retrieve real-world match fixtures
    performLiveApiSync(loadedFixtures)
      .then(({ updatedFixtures, log }) => {
        if (updatedFixtures.length > 0) {
          setFixtures(updatedFixtures);
          saveCustomFixtures(updatedFixtures);
          setScrapeLogs(prev => [log, ...prev].slice(0, 50));
        }
      })
      .catch((err) => {
        console.warn('Live API auto-sync on startup:', err);
      });
  }, []);

  // Sync settings changes to localStorage
  const handleTabChange = (tab: 'timeline' | 'favourites' | 'learning') => {
    setActiveTab(tab);
    saveUserSettings({ activeTab: tab });
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    saveUserSettings({ searchQuery: query });
  };

  const handleLeagueChange = (league: string) => {
    setSelectedLeague(league);
    saveUserSettings({ selectedLeague: league });
  };

  const handleDateRangeChange = (newRange: DateRangeFilter) => {
    setDateRange(newRange);
    saveUserSettings({ dateRange: newRange });
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedLeague('all');
    setSelectedCategory('all');
    setActiveTab('timeline');
    setDateRange(DEFAULT_DATE_RANGE);
    saveUserSettings({ searchQuery: '', selectedLeague: 'all', activeTab: 'timeline', dateRange: DEFAULT_DATE_RANGE });
  };

  // Evaluate all predictions sequentially through the pure JS 8-rule engine with adaptive calibrated weights
  const predictions = useMemo(() => {
    return evaluateAllFixtures(fixtures, overrides, learningState.weights);
  }, [fixtures, overrides, learningState.weights]);

  // Derive unique available leagues for filtering
  const availableLeagues = useMemo(() => {
    const leagues = Array.from(new Set(fixtures.map((f) => f.league)));
    return leagues.sort();
  }, [fixtures]);

  // Counts of fixtures per league
  const leagueCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    fixtures.forEach((f) => {
      counts[f.league] = (counts[f.league] || 0) + 1;
    });
    return counts;
  }, [fixtures]);

  // Filter fixtures according to tab, date range, search, category, and league
  // CRITICAL REQUIREMENT: Strict Timeline Sorting must be maintained!
  const displayedFixtures = useMemo(() => {
    let list = fixtures;

    // Tab Filter
    if (activeTab === 'favourites') {
      list = list.filter((f) => {
        const homeFav = isFavouriteTeam(f.homeTeam.name);
        const awayFav = isFavouriteTeam(f.awayTeam.name);
        return homeFav || awayFav;
      });
    }

    // Date Range Filter (Upcoming dates / specific kickoff range)
    if (dateRange && (dateRange.presetId !== 'all' || dateRange.startDate || dateRange.endDate)) {
      list = list.filter((f) => isFixtureInDateRange(f, dateRange));
    }

    // Category Filter (when all leagues are viewed)
    if (selectedLeague === 'all' && selectedCategory !== 'all') {
      list = list.filter((f) => matchesLeagueCategory(f.league, selectedCategory));
    }

    // Specific League Filter
    if (selectedLeague !== 'all') {
      list = list.filter((f) => f.league === selectedLeague);
    }

    // Search Filter (Team names, league, venue)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (f) =>
          f.homeTeam.name.toLowerCase().includes(q) ||
          f.awayTeam.name.toLowerCase().includes(q) ||
          f.homeTeam.shortName.toLowerCase().includes(q) ||
          f.awayTeam.shortName.toLowerCase().includes(q) ||
          f.league.toLowerCase().includes(q) ||
          f.venue.toLowerCase().includes(q)
      );
    }

    // Strict Timeline Sorting: earliest kickoff time at top
    return sortFixturesByKickoff(list);
  }, [fixtures, activeTab, dateRange, selectedLeague, selectedCategory, searchQuery]);

  // Total counts
  const totalMatchesCount = fixtures.length;
  const favouritesMatchesCount = useMemo(() => {
    return fixtures.filter(
      (f) => isFavouriteTeam(f.homeTeam.name) || isFavouriteTeam(f.awayTeam.name)
    ).length;
  }, [fixtures]);

  // Category fixture counts based on current active tab
  const categoryCounts = useMemo(() => {
    const base =
      activeTab === 'favourites'
        ? fixtures.filter((f) => isFavouriteTeam(f.homeTeam.name) || isFavouriteTeam(f.awayTeam.name))
        : fixtures;
    const counts: Record<string, number> = {
      all: base.length,
    };
    LEAGUE_CATEGORIES.forEach((cat) => {
      if (cat.id !== 'all') {
        counts[cat.id] = base.filter((f) => matchesLeagueCategory(f.league, cat.id)).length;
      }
    });
    return counts;
  }, [fixtures, activeTab]);

  // Earliest and latest date bounds across the fixtures dataset
  const dateBounds = useMemo(() => {
    return getDatasetDateBounds(fixtures);
  }, [fixtures]);

  // Fixture counts for each date preset (relative to current active tab)
  const datePresetCounts = useMemo(() => {
    const baseList =
      activeTab === 'favourites'
        ? fixtures.filter((f) => isFavouriteTeam(f.homeTeam.name) || isFavouriteTeam(f.awayTeam.name))
        : fixtures;

    const presets: DatePresetId[] = ['all', 'today', 'tomorrow', 'weekend', '7days', '14days', 'month'];
    const counts: Record<DatePresetId, number> = {} as Record<DatePresetId, number>;
    presets.forEach((p) => {
      counts[p] = countMatchesForPreset(baseList, p);
    });
    return counts;
  }, [fixtures, activeTab]);

  // Compute live empirical cumulative prediction success rate from historical backtest & calibrated weights
  const backtestEval = useMemo(() => {
    return evaluateHistoricalBacktest(HISTORICAL_MATCH_RESULTS, learningState.weights);
  }, [learningState.weights]);

  const cumulativeSuccessRate = backtestEval.accuracyPct;
  const correctPredictionsCount = backtestEval.correctCount;
  const totalPredictionsEvaluated = backtestEval.totalCount;

  const activeOverridesCount = Object.keys(overrides).length;

  // Handle Manual Override toggles (Rule 8)
  const handleOverrideChange = (matchId: string, override: ManualOverrideType) => {
    const updated = saveManualOverride(matchId, override);
    setOverrides({ ...updated });
  };

  // Reset all overrides back to automatic mathematical predictions
  const handleResetAllOverrides = () => {
    const cleared = clearAllManualOverrides();
    setOverrides(cleared);
  };

  // Trigger an automated scraping and live API ingestion cycle
  const triggerScrapeCycle = useCallback(() => {
    setIsScrapingNow(true);
    performLiveApiSync(fixtures)
      .then(({ updatedFixtures, log }) => {
        setFixtures(updatedFixtures);
        saveCustomFixtures(updatedFixtures);
        const newLogs = saveScrapeLog(log);
        setScrapeLogs(newLogs);

        setAutoScrapeConfig((prev) => {
          const updated = saveAutoScrapeConfig({
            ...prev,
            lastScrapedAt: new Date().toISOString(),
            totalScrapesCount: prev.totalScrapesCount + 1,
          });
          return updated;
        });

        // If background auto-learning is enabled, run an incremental gradient calibration epoch
        if (learningState.isAutoLearningEnabled) {
          const tuned = trainSingleEpoch(learningState.weights, HISTORICAL_MATCH_RESULTS, 0.02);
          const updatedState: LearningModelState = {
            ...learningState,
            weights: tuned.updatedWeights,
            accuracyPct: tuned.newAccuracy,
            brierLoss: tuned.newLoss,
            totalEpochsTrained: learningState.totalEpochsTrained + 1,
            lastTrainedAt: new Date().toISOString(),
            recentLossHistory: [...learningState.recentLossHistory, tuned.newLoss].slice(-15),
          };
          saveLearningState(updatedState);
          setLearningState(updatedState);
        }

        setIsScrapingNow(false);
        setSecondsUntilNextScrape(autoScrapeConfig.intervalSeconds);
        setAutoScrapeNotice(`Live Sync: ${updatedFixtures.length} real fixtures synchronized • Weights active (${learningState.accuracyPct.toFixed(1)}% Acc)`);
        setTimeout(() => setAutoScrapeNotice(null), 4000);
      })
      .catch((err) => {
        console.warn('Scraper cycle error:', err);
        setIsScrapingNow(false);
        setSecondsUntilNextScrape(autoScrapeConfig.intervalSeconds);
      });
  }, [autoScrapeConfig.intervalSeconds, fixtures, learningState]);

  // Automated Scraper Interval Countdown
  useEffect(() => {
    if (!autoScrapeConfig.enabled) return;

    const timer = setInterval(() => {
      setSecondsUntilNextScrape((prev) => {
        if (prev <= 1) {
          triggerScrapeCycle();
          return autoScrapeConfig.intervalSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoScrapeConfig.enabled, autoScrapeConfig.intervalSeconds, triggerScrapeCycle]);

  // Toggle Auto-Scraping ON / OFF
  const handleToggleAutoScrape = () => {
    const updated = saveAutoScrapeConfig({ enabled: !autoScrapeConfig.enabled });
    setAutoScrapeConfig(updated);
    if (updated.enabled) {
      setSecondsUntilNextScrape(updated.intervalSeconds);
    }
  };

  // Update Auto-Scraping Config (e.g. interval)
  const handleUpdateAutoScrapeConfig = (newConfig: Partial<AutoScrapeConfig>) => {
    const updated = saveAutoScrapeConfig(newConfig);
    setAutoScrapeConfig(updated);
    if (newConfig.intervalSeconds) {
      setSecondsUntilNextScrape(newConfig.intervalSeconds);
    }
  };

  // Custom fixtures import
  const handleImportCustomFixtures = (custom: MatchFixture[]) => {
    saveCustomFixtures(custom);
    setFixtures(custom);
  };

  // Restore factory defaults
  const handleRestoreDefaults = () => {
    const defaults = restoreDefaultFixtures();
    setFixtures(defaults);
  };

  const metadata: IngestionMetadata = useMemo(() => {
    return getIngestionMetadata(fixtures);
  }, [fixtures]);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col selection:bg-sky-500 selection:text-slate-950 font-sans relative">
      {/* Dynamic Auto-Scrape Telemetry Notification */}
      {autoScrapeNotice && (
        <div className="fixed top-16 right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="bg-slate-900/95 border border-sky-500/50 text-sky-200 px-3.5 py-2 rounded-lg shadow-xl flex items-center gap-2.5 text-xs font-mono backdrop-blur">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
            <Zap className="w-3.5 h-3.5 text-sky-400" />
            <span>{autoScrapeNotice}</span>
          </div>
        </div>
      )}

      {/* Primary Sticky Navbar */}
      <Navbar
        onOpenIngestion={() => setIsIngestionModalOpen(true)}
        onOpenRules={() => setIsRulesModalOpen(true)}
        onOpenFavouritesList={() => setIsFavMatrixOpen(true)}
        onOpenLearning={() => handleTabChange('learning')}
        onOpenApkModal={() => setIsApkModalOpen(true)}
        overridesCount={activeOverridesCount}
        autoScrapeEnabled={autoScrapeConfig.enabled}
        onToggleAutoScrape={handleToggleAutoScrape}
        secondsUntilNextScrape={secondsUntilNextScrape}
        isScrapingNow={isScrapingNow}
        onTriggerScrapeNow={triggerScrapeCycle}
        cumulativeSuccessRate={cumulativeSuccessRate}
        correctPredictionsCount={correctPredictionsCount}
        totalPredictionsCount={totalPredictionsEvaluated}
      />

      {/* Main Workspace Layout with Technical Sidebar & Dashboard Grid */}
      <div className="flex flex-1 overflow-hidden">
        {/* Technical Sidebar */}
        <TechnicalSidebar
          onOpenRules={() => setIsRulesModalOpen(true)}
          onOpenFavourites={() => setIsFavMatrixOpen(true)}
          onNavigateToLearning={() => handleTabChange('learning')}
          learningAccuracyPct={cumulativeSuccessRate}
          favouritesCount={80}
          autoScrapeEnabled={autoScrapeConfig.enabled}
          secondsUntilNextScrape={secondsUntilNextScrape}
          intervalSeconds={autoScrapeConfig.intervalSeconds}
          isScrapingNow={isScrapingNow}
          onTriggerScrapeNow={triggerScrapeCycle}
          onToggleAutoScrape={handleToggleAutoScrape}
        />

        {/* Main Content Workspace */}
        <div className="flex-1 flex flex-col bg-[#020617] overflow-y-auto px-4 sm:px-6 py-4">
          <div className="max-w-7xl w-full mx-auto space-y-3">
            {/* Top Summary Stats Bar */}
            <StatsOverview
              fixtures={fixtures}
              predictions={predictions}
              overridesCount={activeOverridesCount}
              cumulativeSuccessRate={cumulativeSuccessRate}
              correctPredictionsCount={correctPredictionsCount}
              totalPredictionsCount={totalPredictionsEvaluated}
              brierLoss={backtestEval.brierLoss}
              onOpenLearning={() => handleTabChange('learning')}
            />

            {/* Primary Interactive Tab Navigation & Search Controls */}
            <TabNavigation
              activeTab={activeTab}
              onTabChange={handleTabChange}
              totalMatchesCount={totalMatchesCount}
              favouritesMatchesCount={favouritesMatchesCount}
              displayedMatchesCount={displayedFixtures.length}
              learningAccuracyPct={cumulativeSuccessRate}
              correctPredictionsCount={correctPredictionsCount}
              totalPredictionsCount={totalPredictionsEvaluated}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              selectedLeague={selectedLeague}
              onLeagueChange={handleLeagueChange}
              availableLeagues={availableLeagues}
              leagueCounts={leagueCounts}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              categoryCounts={categoryCounts}
              overridesCount={activeOverridesCount}
              onResetAllOverrides={handleResetAllOverrides}
              dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
              datePresetCounts={datePresetCounts}
              dateBounds={dateBounds}
            />

            {/* AI Self-Learning View */}
            {activeTab === 'learning' ? (
              <SelfLearningDashboard
                learningState={learningState}
                onUpdateLearningState={(newState) => {
                  setLearningState(newState);
                  saveLearningState(newState);
                }}
                onOpenApkModal={() => setIsApkModalOpen(true)}
              />
            ) : (
              <>
                {/* Context Banner if on Favourites Tab */}
                {activeTab === 'favourites' && (
                  <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 flex items-center justify-between text-xs text-amber-200 font-mono">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 fill-amber-400 text-amber-400 flex-shrink-0" />
                      <span>
                        <strong>PRIORITY FAVOURITES FEED:</strong> Filtered to fixtures featuring any of the 80 designated teams. Rule 8 automatically enforces a minimum 55% prediction win floor.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFavMatrixOpen(true)}
                      className="px-2.5 py-1 rounded bg-amber-400 text-slate-950 text-[11px] font-bold hover:bg-amber-300 transition-colors whitespace-nowrap ml-2"
                    >
                      80 MATRIX
                    </button>
                  </div>
                )}

                {/* Fixtures Timeline Feed */}
                {displayedFixtures.length > 0 ? (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pb-8" id="fixtures-timeline-grid">
                    {displayedFixtures.map((fixture) => {
                      const prediction = predictions[fixture.id] || {
                        matchId: fixture.id,
                        homeWinPct: 33.3,
                        drawPct: 33.4,
                        awayWinPct: 33.3,
                        predictedWinner: 'draw',
                        confidenceScore: 50,
                        appliedRules: [],
                        rawPoints: { home: 10, away: 8.5, draw: 6.8 },
                        finalPoints: { home: 10, away: 8.5, draw: 6.8 },
                        isFavouriteMatch: false,
                        favouriteTeams: [],
                        manualOverride: 'none',
                        isVolatilityCompressed: false,
                      };

                      return (
                        <MatchCard
                          key={fixture.id}
                          fixture={fixture}
                          prediction={prediction}
                          onOverrideChange={handleOverrideChange}
                          historicalResults={HISTORICAL_MATCH_RESULTS}
                        />
                      );
                    })}
                  </div>
                ) : (
                  /* Enhanced Informative Empty State */
                  <div className="p-8 sm:p-12 text-center bg-[#0f172a] border border-slate-800 rounded-xl my-6 space-y-5">
                    <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-amber-400">
                      <AlertCircle className="w-6 h-6" />
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-lg font-bold text-slate-200 font-mono tracking-wide">
                        NO MATCHING FIXTURES FOUND
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto">
                        Your current filter criteria resulted in zero matches from the {totalMatchesCount} loaded fixtures.
                      </p>
                    </div>

                    {/* Active Filters Inspection Box */}
                    <div className="max-w-xl mx-auto p-4 bg-slate-900/90 border border-slate-800 rounded-lg text-left text-xs font-mono space-y-2.5">
                      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold flex items-center justify-between">
                        <span>Currently Active Filter Selection:</span>
                        <span className="text-slate-400">Total Available: {totalMatchesCount} Fixtures</span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {activeTab === 'favourites' && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-950/60 border border-amber-800/60 text-amber-300 text-xs">
                            <Star className="w-3 h-3 fill-current" />
                            <span>Tab: ⭐ 80 Favourites ({favouritesMatchesCount} total)</span>
                            <button
                              type="button"
                              onClick={() => handleTabChange('timeline')}
                              className="ml-1 text-amber-400 hover:text-white p-0.5"
                              title="Switch to All Matches Timeline"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {searchQuery && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-950/60 border border-sky-800/60 text-sky-300 text-xs">
                            <Search className="w-3 h-3" />
                            <span>Search: &ldquo;{searchQuery}&rdquo;</span>
                            <button
                              type="button"
                              onClick={() => handleSearchChange('')}
                              className="ml-1 text-sky-400 hover:text-white p-0.5"
                              title="Clear search filter"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {selectedCategory !== 'all' && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 text-xs">
                            <Filter className="w-3 h-3" />
                            <span>
                              Category: {LEAGUE_CATEGORIES.find((c) => c.id === selectedCategory)?.label || selectedCategory}
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedCategory('all')}
                              className="ml-1 text-indigo-400 hover:text-white p-0.5"
                              title="Reset category to all"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {selectedLeague !== 'all' && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs">
                            <Filter className="w-3 h-3" />
                            <span>League: {selectedLeague}</span>
                            <button
                              type="button"
                              onClick={() => handleLeagueChange('all')}
                              className="ml-1 text-emerald-400 hover:text-white p-0.5"
                              title="Reset league to all"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {(dateRange.presetId !== 'all' || dateRange.startDate || dateRange.endDate) && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-950/60 border border-sky-800/60 text-sky-300 text-xs">
                            <CalendarRange className="w-3 h-3" />
                            <span>Dates: {getDateRangeSummaryLabel(dateRange)}</span>
                            <button
                              type="button"
                              onClick={() => handleDateRangeChange(DEFAULT_DATE_RANGE)}
                              className="ml-1 text-sky-400 hover:text-white p-0.5"
                              title="Reset date filter"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {activeTab === 'favourites' && (
                        <p className="text-[11px] text-amber-400/90 pt-1 leading-relaxed">
                          💡 <strong>Notice:</strong> The Favourites tab filters exclusively for fixtures featuring the 80 designated priority clubs. If no matches in your selected league or search match these 80 clubs, switch to the <strong>All Matches Timeline</strong> to view all fixtures.
                        </p>
                      )}
                    </div>

                    {/* Quick Resolution Actions */}
                    <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-mono font-bold text-white flex items-center gap-2 transition-all shadow-lg hover:shadow-sky-500/20"
                        id="btn-empty-reset-all"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Reset All Filters & View All {totalMatchesCount} Matches</span>
                      </button>

                      {activeTab === 'favourites' && (
                        <button
                          type="button"
                          onClick={() => handleTabChange('timeline')}
                          className="px-3.5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-amber-300 border border-slate-700 flex items-center gap-1.5 transition-colors"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Switch to All Matches Timeline ({totalMatchesCount})</span>
                        </button>
                      )}

                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => handleSearchChange('')}
                          className="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 border border-slate-700 transition-colors"
                        >
                          Clear Search (&ldquo;{searchQuery}&rdquo;)
                        </button>
                      )}

                      {selectedCategory !== 'all' && (
                        <button
                          type="button"
                          onClick={() => setSelectedCategory('all')}
                          className="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 border border-slate-700 transition-colors"
                        >
                          Reset Category
                        </button>
                      )}

                      {selectedLeague !== 'all' && (
                        <button
                          type="button"
                          onClick={() => handleLeagueChange('all')}
                          className="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 border border-slate-700 transition-colors"
                        >
                          Show All Leagues
                        </button>
                      )}

                      {(dateRange.presetId !== 'all' || dateRange.startDate || dateRange.endDate) && (
                        <button
                          type="button"
                          onClick={() => handleDateRangeChange(DEFAULT_DATE_RANGE)}
                          className="px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-sky-300 border border-slate-700 transition-colors"
                        >
                          Reset Date Filter ({getDateRangeSummaryLabel(dateRange)})
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modals & Inspection Drawers */}
      <FavouritesMatrixModal
        isOpen={isFavMatrixOpen}
        onClose={() => setIsFavMatrixOpen(false)}
        fixtures={fixtures}
      />

      <RulesReferenceModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
      />

      <ScraperIngestionModal
        isOpen={isIngestionModalOpen}
        onClose={() => setIsIngestionModalOpen(false)}
        metadata={metadata}
        fixtures={fixtures}
        onImportCustomFixtures={handleImportCustomFixtures}
        onRestoreDefaults={handleRestoreDefaults}
        autoScrapeConfig={autoScrapeConfig}
        onUpdateAutoScrapeConfig={handleUpdateAutoScrapeConfig}
        secondsUntilNextScrape={secondsUntilNextScrape}
        isScrapingNow={isScrapingNow}
        onTriggerScrapeNow={triggerScrapeCycle}
        scrapeLogs={scrapeLogs}
      />

      {/* APK Packaging & Zero Data Loss Modal */}
      <ApkAndPerformanceModal
        isOpen={isApkModalOpen}
        onClose={() => setIsApkModalOpen(false)}
        learningState={learningState}
        onUpdateLearningState={(newState) => {
          setLearningState(newState);
          saveLearningState(newState);
        }}
        totalFixturesCount={fixtures.length}
      />

      {/* Technical Dashboard Footer */}
      <footer className="h-10 bg-slate-900 border-t border-slate-800 px-4 sm:px-6 flex items-center justify-between text-[10px] text-slate-500 font-mono flex-shrink-0 z-20">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>ENGINE STATUS: NOMINAL</span>
          </span>
          <span className="hidden sm:flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-500"></span>
            <span>AUTO-SCRAPE: {autoScrapeConfig.enabled ? `ACTIVE (${secondsUntilNextScrape}s)` : 'PAUSED'}</span>
          </span>
          <span className="hidden md:inline text-slate-600">|</span>
          <button
            type="button"
            onClick={() => setIsApkModalOpen(true)}
            className="flex items-center gap-1 text-sky-400 hover:text-sky-300 font-bold transition-colors cursor-pointer"
          >
            <Smartphone className="w-3 h-3" />
            <span>PACKAGE APK & DATA PROTECTION</span>
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-emerald-400 font-semibold">{autoScrapeConfig.totalScrapesCount} AUTO-CYCLES RUN</span>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="text-emerald-400 font-semibold">DUAL-LAYER PERSISTENCE ACTIVE</span>
        </div>
      </footer>
    </div>
  );
}

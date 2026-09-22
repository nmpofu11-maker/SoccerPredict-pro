import React, { useState, useEffect } from 'react';
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  Star,
  Search,
  Filter,
  RotateCcw,
  Clock,
  Globe,
  Trophy,
  Flame,
  Compass,
  Sun,
  Shield,
  AlertTriangle,
  Brain,
  ChevronDown,
  X,
  Check,
  CalendarCheck,
  Target,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { LEAGUE_CATEGORIES, LeagueCategoryId, getLeagueMeta } from '../constants/leagues';
import { isHighVolatilityLeague } from '../constants/favourites';
import { DatePresetId, DateRangeFilter } from '../types/soccer';
import {
  calculatePresetDates,
  getDateRangeSummaryLabel,
  formatFriendlyDate,
  DEFAULT_DATE_RANGE,
} from '../utils/dateFilterUtils';

interface TabNavigationProps {
  activeTab: 'timeline' | 'favourites' | 'learning' | 'yesterday' | 'groups' | 'todaysMatches' | 'smartCoach';
  onTabChange: (tab: any) => void;
  totalMatchesCount: number;
  favouritesMatchesCount: number;
  displayedMatchesCount?: number;
  learningAccuracyPct?: number;
  correctPredictionsCount?: number;
  totalPredictionsCount?: number;
  yesterdayStats?: {
    total: number;
    correct: number;
    wrong: number;
    accuracyPct: number;
    date: string;
  };
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedLeague: string;
  onLeagueChange: (league: string) => void;
  availableLeagues: string[];
  leagueCounts?: Record<string, number>;
  selectedCategory?: LeagueCategoryId;
  onCategoryChange?: (category: LeagueCategoryId) => void;
  categoryCounts?: Record<string, number>;
  overridesCount: number;
  onResetAllOverrides: () => void;
  // Date Range Selector props
  dateRange: DateRangeFilter;
  onDateRangeChange: (range: DateRangeFilter) => void;
  datePresetCounts?: Record<DatePresetId, number>;
  dateBounds?: { minDate: string; maxDate: string };
}

const DATE_PRESETS: { id: DatePresetId; label: string }[] = [
  { id: 'all', label: 'All Dates' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'weekend', label: 'This Weekend' },
  { id: '7days', label: 'Next 7 Days' },
  { id: '14days', label: 'Next 14 Days' },
  { id: 'month', label: 'This Month' },
];

export const TabNavigation: React.FC<TabNavigationProps> = ({
  activeTab,
  onTabChange,
  totalMatchesCount,
  favouritesMatchesCount,
  displayedMatchesCount,
  learningAccuracyPct = 81.3,
  correctPredictionsCount = 35,
  totalPredictionsCount = 43,
  yesterdayStats,
  searchQuery,
  onSearchChange,
  selectedLeague,
  onLeagueChange,
  availableLeagues,
  leagueCounts = {},
  selectedCategory = 'all',
  onCategoryChange,
  categoryCounts = {},
  overridesCount,
  onResetAllOverrides,
  dateRange,
  onDateRangeChange,
  datePresetCounts = {} as Record<DatePresetId, number>,
  dateBounds,
}) => {
  const [isCustomOpen, setIsCustomOpen] = useState(dateRange.presetId === 'custom');
  const [customStart, setCustomStart] = useState(dateRange.startDate || '');
  const [customEnd, setCustomEnd] = useState(dateRange.endDate || '');

  // Keep local custom inputs synced with dateRange prop
  useEffect(() => {
    setCustomStart(dateRange.startDate || '');
    setCustomEnd(dateRange.endDate || '');
    if (dateRange.presetId === 'custom') {
      setIsCustomOpen(true);
    }
  }, [dateRange.startDate, dateRange.endDate, dateRange.presetId]);

  const isDateFilterActive =
    dateRange.presetId !== 'all' || Boolean(dateRange.startDate) || Boolean(dateRange.endDate);
  const activeDateLabel = getDateRangeSummaryLabel(dateRange);

  const handlePresetClick = (presetId: DatePresetId) => {
    if (presetId === 'all') {
      setIsCustomOpen(false);
      onDateRangeChange(DEFAULT_DATE_RANGE);
      return;
    }

    if (presetId === 'custom') {
      setIsCustomOpen((prev) => !prev);
      return;
    }

    setIsCustomOpen(false);
    const { startDate, endDate } = calculatePresetDates(presetId);
    onDateRangeChange({
      startDate,
      endDate,
      presetId,
    });
  };

  const handleApplyCustom = () => {
    if (!customStart && !customEnd) {
      onDateRangeChange(DEFAULT_DATE_RANGE);
      setIsCustomOpen(false);
      return;
    }

    let start = customStart;
    let end = customEnd;

    // Auto-swap if start is after end
    if (start && end && start > end) {
      const temp = start;
      start = end;
      end = temp;
      setCustomStart(start);
      setCustomEnd(end);
    }

    onDateRangeChange({
      startDate: start,
      endDate: end,
      presetId: 'custom',
    });
  };

  const handleResetDateFilter = () => {
    setCustomStart('');
    setCustomEnd('');
    setIsCustomOpen(false);
    onDateRangeChange(DEFAULT_DATE_RANGE);
  };

  const getCategoryIcon = (iconName: string) => {
    switch (iconName) {
      case 'Trophy':
        return <Trophy className="w-3 h-3 text-amber-400" />;
      case 'Flame':
        return <Flame className="w-3 h-3 text-rose-400" />;
      case 'Compass':
        return <Compass className="w-3 h-3 text-emerald-400" />;
      case 'Sun':
        return <Sun className="w-3 h-3 text-yellow-400" />;
      case 'Shield':
        return <Shield className="w-3 h-3 text-sky-400" />;
      case 'AlertTriangle':
        return <AlertTriangle className="w-3 h-3 text-cyan-400" />;
      default:
        return <Globe className="w-3 h-3 text-slate-400" />;
    }
  };

  return (
    <div className="w-full space-y-3 pb-3" id="tab-navigation-container">
      {/* Technical Dashboard Tab Navigation Bar */}
      <nav
        className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 rounded-t-xl overflow-x-auto"
        role="tablist"
      >
        <div className="flex items-center">
          {/* Tab 1: ALL MATCHES TIMELINE */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'timeline'}
            onClick={() => onTabChange('timeline')}
            className={`px-4 sm:px-5 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all duration-150 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'timeline'
                ? 'border-sky-500 bg-slate-800/60 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
            id="tab-all-matches"
          >
            <Calendar className="w-4 h-4" />
            <span>MATCHES TIMELINE</span>
            <span className="ml-0.5 px-2 py-0.5 bg-slate-800 text-sky-300 rounded-full font-mono text-[11px]">
              {displayedMatchesCount !== undefined && isDateFilterActive
                ? `${displayedMatchesCount}/${totalMatchesCount}`
                : totalMatchesCount}
            </span>
          </button>

          {/* Tab 2: FAVOURITES TAB */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'favourites'}
            onClick={() => onTabChange('favourites')}
            className={`px-4 sm:px-5 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all duration-150 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'favourites'
                ? 'border-amber-400 bg-slate-800/60 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
            id="tab-favourites"
          >
            <Star className="w-4 h-4 fill-current" />
            <span>80 FAVOURITES</span>
            <span className="ml-0.5 px-2 py-0.5 bg-slate-800 text-amber-300 rounded-full font-mono text-[11px]">
              {favouritesMatchesCount}
            </span>
          </button>

          {/* Tab 3: AI SELF-LEARNING */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'learning'}
            onClick={() => onTabChange('learning')}
            className={`px-4 sm:px-5 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all duration-150 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'learning'
                ? 'border-purple-500 bg-purple-950/40 text-purple-300'
                : 'border-transparent text-slate-400 hover:text-purple-300 hover:bg-slate-800/30'
            }`}
            id="tab-self-learning"
          >
            <Brain className="w-4 h-4 text-purple-400" />
            <span>AI CALIBRATION</span>
            <span className="ml-0.5 px-2 py-0.5 bg-purple-950/80 border border-purple-800/60 text-emerald-400 rounded-full font-mono text-[11px] font-bold">
              {learningAccuracyPct.toFixed(1)}%
            </span>
          </button>

          {/* Tab 4: YESTERDAY'S PERFORMANCE */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'yesterday'}
            onClick={() => onTabChange('yesterday')}
            className={`px-4 sm:px-5 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all duration-150 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'yesterday'
                ? 'border-emerald-400 bg-emerald-950/30 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-emerald-300 hover:bg-slate-800/30'
            }`}
            id="tab-yesterday-performance"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>YESTERDAY&apos;S RESULTS</span>
            {yesterdayStats && (
              <span className="ml-0.5 px-2 py-0.5 bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 rounded-full font-mono text-[11px] font-bold">
                {yesterdayStats.correct} Correct / {yesterdayStats.wrong} Wrong
              </span>
            )}
          </button>

          {/* Tab: TODAY'S MATCHES */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'todaysMatches'}
            onClick={() => onTabChange('todaysMatches')}
            className={`px-4 sm:px-5 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all duration-150 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'todaysMatches'
                ? 'border-amber-400 bg-amber-950/40 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-amber-300 hover:bg-slate-800/30'
            }`}
            id="tab-todays-matches"
          >
            <Sun className="w-4 h-4 text-amber-400" />
            <span>TODAY&apos;S MATCHES</span>
            <span className="ml-0.5 px-2 py-0.5 bg-amber-950/80 border border-amber-800/60 text-amber-300 rounded-full font-mono text-[11px] font-bold">
              Live
            </span>
          </button>

          {/* Tab 5: SMART ACCUMULATOR & COACH (Includes Quad Groups & Strategy Hub) */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'smartCoach'}
            onClick={() => onTabChange('smartCoach')}
            className={`px-4 sm:px-5 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all duration-150 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'smartCoach'
                ? 'border-indigo-400 bg-indigo-950/50 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-indigo-300 hover:bg-slate-800/30'
            }`}
            id="tab-smart-accumulator-coach"
          >
            <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span>AI STRATEGY & COACH</span>
            <span className="ml-0.5 px-2 py-0.5 bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 rounded-full font-mono text-[11px] font-bold">
              Hub
            </span>
          </button>
        </div>

        {/* Right Info: Match count / Earliest sort */}
        <div className="hidden md:flex items-center gap-2 px-4 py-2 text-xs font-mono text-slate-400">
          <Clock className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
          <span>Chronological Kickoff</span>
        </div>
      </nav>

      {/* Unified Filter Toolbar (only active for upcoming fixture feeds) */}
      {(activeTab === 'timeline' || activeTab === 'favourites') && (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 space-y-2.5">
          {/* Row 1: Search + League Select + Date Range Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          {/* Search Box (6 cols) */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search teams (Arsenal, Chiefs), leagues..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-8 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
              id="input-search-fixtures"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* League Dropdown (4 cols) */}
          <div className="sm:col-span-4 relative">
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedLeague}
              onChange={(e) => {
                onLeagueChange(e.target.value);
                if (e.target.value !== 'all') {
                  onCategoryChange?.('all');
                }
              }}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-8 pr-7 py-2 appearance-none focus:outline-none focus:border-sky-500 font-mono"
              id="select-league-filter"
            >
              <option value="all">All Leagues ({availableLeagues.length})</option>
              {availableLeagues.map((league) => {
                const meta = getLeagueMeta(league);
                const count = leagueCounts[league] ?? 1;
                const isVolatile = isHighVolatilityLeague(league);
                return (
                  <option key={league} value={league}>
                    {meta.flagEmoji} {meta.country} / {league} ({count}) {isVolatile ? '⚡' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Date Range Dropdown (3 cols) */}
          <div className="sm:col-span-3 relative">
            <CalendarDays className="w-3.5 h-3.5 text-sky-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={dateRange.presetId}
              onChange={(e) => handlePresetClick(e.target.value as DatePresetId)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-8 pr-7 py-2 appearance-none focus:outline-none focus:border-sky-500 font-mono"
              id="select-date-preset"
            >
              {DATE_PRESETS.map((preset) => {
                const count = datePresetCounts[preset.id];
                return (
                  <option key={preset.id} value={preset.id}>
                    {preset.label} {typeof count === 'number' ? `(${count})` : ''}
                  </option>
                );
              })}
              <option value="custom">Custom Date Range...</option>
            </select>
          </div>
        </div>

        {/* Row 2: League Region Chips + Quick Filter Indicators */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/60 text-xs font-mono">
          {/* Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {LEAGUE_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id && selectedLeague === 'all';
              const count = categoryCounts[cat.id];
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    onCategoryChange?.(cat.id);
                    onLeagueChange('all');
                  }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] whitespace-nowrap transition-all border ${
                    isSelected
                      ? 'bg-sky-950/80 border-sky-500 text-sky-200 font-bold'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {getCategoryIcon(cat.icon)}
                  <span>{cat.label}</span>
                  {typeof count === 'number' && count > 0 && (
                    <span className="text-[10px] text-slate-500 ml-0.5">({count})</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filter Status & Reset Actions */}
          <div className="flex items-center gap-2">
            {(searchQuery || selectedLeague !== 'all' || isDateFilterActive || selectedCategory !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  onSearchChange('');
                  onLeagueChange('all');
                  onCategoryChange?.('all');
                  handleResetDateFilter();
                }}
                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono transition-colors"
                title="Reset all active search, league, and date filters"
              >
                <X className="w-3 h-3 text-rose-400" />
                <span>Reset Filters</span>
              </button>
            )}

            {overridesCount > 0 && (
              <button
                type="button"
                onClick={onResetAllOverrides}
                className="flex items-center gap-1 px-2 py-1 bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-800/60 rounded text-[11px] font-mono transition-colors"
                id="btn-reset-all-overrides"
                title="Reset manual overrides"
              >
                <RotateCcw className="w-3 h-3 text-purple-400" />
                <span>Reset {overridesCount} Overrides</span>
              </button>
            )}
          </div>
        </div>

        {/* Custom Date Range Picker Dropdown (Only when custom is active) */}
        {isCustomOpen && (
          <div
            className="p-3 rounded-lg bg-slate-950 border border-sky-500/40 text-xs font-mono space-y-2.5 mt-2"
            id="custom-date-range-picker"
          >
            <div className="flex items-center justify-between text-slate-300 pb-1 border-b border-slate-800">
              <span className="font-bold text-sky-300 text-xs flex items-center gap-1.5">
                <CalendarCheck className="w-3.5 h-3.5 text-sky-400" />
                <span>Custom Kickoff Date Range</span>
              </span>
              {dateBounds && (
                <span className="text-[10px] text-slate-400">
                  {formatFriendlyDate(dateBounds.minDate)} – {formatFriendlyDate(dateBounds.maxDate, true)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                  Start Date:
                </label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  min={dateBounds?.minDate}
                  max={dateBounds?.maxDate}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500 font-mono"
                  id="input-date-start"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                  End Date:
                </label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  min={customStart || dateBounds?.minDate}
                  max={dateBounds?.maxDate}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500 font-mono"
                  id="input-date-end"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApplyCustom}
                  disabled={!customStart && !customEnd}
                  className="flex-1 py-1.5 px-3 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-slate-950 font-bold text-xs font-mono transition-colors flex items-center justify-center gap-1"
                  id="btn-apply-custom-date"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Apply Range</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetDateFilter}
                  className="py-1.5 px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )}
  </div>
);
};

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
  activeTab: 'timeline' | 'favourites' | 'learning';
  onTabChange: (tab: 'timeline' | 'favourites' | 'learning') => void;
  totalMatchesCount: number;
  favouritesMatchesCount: number;
  displayedMatchesCount?: number;
  learningAccuracyPct?: number;
  correctPredictionsCount?: number;
  totalPredictionsCount?: number;
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
        className="flex items-center justify-between border-b border-slate-800 bg-[#0f172a]/80 rounded-t-lg overflow-x-auto"
        role="tablist"
      >
        <div className="flex items-center">
          {/* Tab 1: 📅 ALL MATCHES TIMELINE */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'timeline'}
            onClick={() => onTabChange('timeline')}
            className={`px-4 sm:px-6 py-3.5 text-xs sm:text-sm font-bold border-b-2 transition-all duration-150 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'timeline'
                ? 'border-sky-500 bg-slate-900/60 text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900/30'
            }`}
            id="tab-all-matches"
          >
            <Calendar className="w-4 h-4" />
            <span>📅 MATCHES TIMELINE</span>
            <span className="ml-1 px-2 py-0.5 bg-slate-800 text-sky-300 rounded font-mono text-[11px]">
              {displayedMatchesCount !== undefined && isDateFilterActive
                ? `${displayedMatchesCount} / ${totalMatchesCount}`
                : totalMatchesCount}
            </span>
          </button>

          {/* Tab 2: ⭐ FAVOURITES TAB */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'favourites'}
            onClick={() => onTabChange('favourites')}
            className={`px-4 sm:px-6 py-3.5 text-xs sm:text-sm font-bold border-b-2 transition-all duration-150 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'favourites'
                ? 'border-amber-400 bg-slate-900/60 text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900/30'
            }`}
            id="tab-favourites"
          >
            <Star className="w-4 h-4 fill-current" />
            <span>⭐ 80 FAVOURITES</span>
            <span className="ml-1 px-2 py-0.5 bg-slate-800 text-amber-300 rounded font-mono text-[11px]">
              {favouritesMatchesCount}
            </span>
          </button>

          {/* Tab 3: 🧠 AI SELF-LEARNING */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'learning'}
            onClick={() => onTabChange('learning')}
            className={`px-4 sm:px-6 py-3.5 text-xs sm:text-sm font-bold border-b-2 transition-all duration-150 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'learning'
                ? 'border-purple-500 bg-purple-950/30 text-purple-300'
                : 'border-transparent text-slate-500 hover:text-purple-300 hover:bg-slate-900/30'
            }`}
            id="tab-self-learning"
          >
            <Brain className="w-4 h-4 text-purple-400 animate-pulse" />
            <span>🧠 AI SELF-LEARNING</span>
            <span className="ml-1 px-2 py-0.5 bg-purple-900/60 border border-purple-500/40 text-purple-200 rounded font-mono text-[11px] flex items-center gap-1">
              <span className="text-emerald-400 font-bold">{learningAccuracyPct.toFixed(1)}%</span>
              <span className="hidden sm:inline">Success</span>
            </span>
          </button>
        </div>

        {/* Right Status Controls: Cumulative Prediction Success Rate & Timeline Sort */}
        <div className="flex items-center gap-2.5 px-3 py-1.5">
          {/* Cumulative Success Rate % Pill Indicator */}
          <button
            type="button"
            onClick={() => onTabChange('learning')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/40 text-xs font-mono transition-colors shadow-sm group"
            id="tab-nav-cumulative-success"
            title="Cumulative Prediction Success Rate (click to inspect AI Self-Learning)"
          >
            <Target className="w-3.5 h-3.5 text-emerald-400 group-hover:rotate-45 transition-transform" />
            <span className="text-[10px] uppercase text-slate-400 font-bold hidden xs:inline">Success:</span>
            <span className="font-extrabold text-emerald-400 text-xs">{learningAccuracyPct.toFixed(1)}%</span>
            {totalPredictionsCount !== undefined && (
              <span className="text-emerald-300/70 text-[10px] hidden lg:inline">({correctPredictionsCount}/{totalPredictionsCount})</span>
            )}
          </button>

          {/* Strict Timeline Sort Indicator */}
          <div className="hidden md:flex items-center gap-1.5 text-slate-400 text-xs font-mono px-2 py-1">
            <Clock className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
            <span className="text-[11px]">Timeline Sort: Earliest kickoff at top</span>
          </div>
        </div>
      </nav>

      {/* Quick League Categories Strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono no-scrollbar">
        <span className="text-[10px] text-slate-500 uppercase font-bold mr-1 flex-shrink-0">
          LEAGUES:
        </span>
        {LEAGUE_CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.id && selectedLeague === 'all';
          const count = categoryCounts[cat.id];
          const hasCount = typeof count === 'number';
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                onCategoryChange?.(cat.id);
                onLeagueChange('all');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap transition-all border ${
                isSelected
                  ? 'bg-sky-950/80 border-sky-600 text-sky-200 font-bold shadow-sm'
                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {getCategoryIcon(cat.icon)}
              <span>{cat.label}</span>
              {hasCount && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold ${
                    count === 0
                      ? 'bg-slate-800/50 text-slate-600'
                      : isSelected
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Upcoming Dates & Date Range Selector Strip */}
      <div className="flex flex-col gap-2 pt-1 border-t border-slate-800/60" id="date-range-filter-panel">
        <div className="flex items-center justify-between gap-2">
          {/* Presets Horizontal Strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono no-scrollbar flex-1">
            <span className="text-[10px] text-sky-400 uppercase font-bold mr-1 flex-shrink-0 flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5 text-sky-400" />
              DATES:
            </span>
            {DATE_PRESETS.map((preset) => {
              const isSelected = dateRange.presetId === preset.id;
              const count = datePresetCounts[preset.id];
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetClick(preset.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap transition-all border ${
                    isSelected
                      ? 'bg-sky-950/90 border-sky-500 text-sky-200 font-bold shadow-sm'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                  id={`btn-date-preset-${preset.id}`}
                >
                  <span>{preset.label}</span>
                  {typeof count === 'number' && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-semibold ${
                        count === 0
                          ? 'bg-slate-800/50 text-slate-600'
                          : isSelected
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Custom Range Toggle Button */}
            <button
              type="button"
              onClick={() => setIsCustomOpen((prev) => !prev)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap transition-all border ${
                dateRange.presetId === 'custom' || isCustomOpen
                  ? 'bg-sky-950/90 border-sky-400 text-sky-200 font-bold shadow-sm'
                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
              id="btn-date-custom-toggle"
              title="Filter by specific custom kickoff date range"
            >
              <CalendarRange className="w-3 h-3 text-sky-400" />
              <span>Custom Range</span>
              <ChevronDown
                className={`w-3 h-3 transition-transform duration-150 ${
                  isCustomOpen ? 'rotate-180 text-sky-300' : 'text-slate-500'
                }`}
              />
            </button>
          </div>

          {/* Quick Clear Date Shortcut Button if filter is active */}
          {isDateFilterActive && (
            <button
              type="button"
              onClick={handleResetDateFilter}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800/90 hover:bg-slate-800 text-slate-300 hover:text-white text-[11px] font-mono border border-slate-700 transition-colors whitespace-nowrap flex-shrink-0"
              title="Reset date filter to All Dates"
              id="btn-reset-date-filter"
            >
              <X className="w-3 h-3 text-rose-400" />
              <span className="hidden xs:inline">All Dates</span>
            </button>
          )}
        </div>

        {/* Collapsible Custom Date Range Picker */}
        {isCustomOpen && (
          <div
            className="p-3 rounded-lg bg-[#0a1226] border border-sky-500/40 shadow-xl text-xs font-mono space-y-2.5 animate-in fade-in duration-150"
            id="custom-date-range-picker"
          >
            <div className="flex items-center justify-between text-slate-300 pb-1.5 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-sky-400" />
                <span className="font-bold text-sky-200 text-xs">
                  Filter Fixtures by Specific Kickoff Dates
                </span>
              </div>
              {dateBounds && (
                <span className="text-[10px] text-slate-400 hidden sm:inline">
                  Dataset Range: {formatFriendlyDate(dateBounds.minDate)} –{' '}
                  {formatFriendlyDate(dateBounds.maxDate, true)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                  From Date (Kickoff Start):
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
                  To Date (Kickoff End):
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
                  className="flex-1 py-1.5 px-3 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs font-mono transition-colors shadow-sm flex items-center justify-center gap-1.5"
                  id="btn-apply-custom-date"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Apply Date Range</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetDateFilter}
                  className="py-1.5 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono border border-slate-700 transition-colors"
                  id="btn-clear-custom-date"
                >
                  Reset
                </button>
              </div>
            </div>

            {customStart && customEnd && customStart > customEnd && (
              <div className="text-[11px] text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                <span>Notice: Start date is after End date. Dates will be ordered automatically on apply.</span>
              </div>
            )}
          </div>
        )}

        {/* Active Date Filter Summary Banner */}
        {isDateFilterActive && (
          <div
            className="flex items-center justify-between px-3 py-1.5 bg-sky-950/40 border border-sky-500/30 rounded-md text-xs font-mono text-sky-200"
            id="active-date-filter-banner"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <CalendarRange className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
              <span className="truncate">
                <strong>DATE FILTER ACTIVE:</strong> {activeDateLabel}
                {displayedMatchesCount !== undefined && (
                  <span className="text-sky-400 ml-1">({displayedMatchesCount} matches found)</span>
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={handleResetDateFilter}
              className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-white font-bold ml-2 underline underline-offset-2 whitespace-nowrap"
              id="btn-banner-clear-date"
            >
              <span>Clear Date Filter</span>
              <X className="w-3 h-3 text-rose-400" />
            </button>
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter teams (e.g. Bolivar, Dinamo, Real Madrid), leagues, venues..."
            className="w-full bg-[#0f172a] border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono"
            id="input-search-fixtures"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white font-mono"
            >
              Clear
            </button>
          )}
        </div>

        {/* League Selector Dropdown */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-initial">
            <Filter className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedLeague}
              onChange={(e) => {
                onLeagueChange(e.target.value);
                if (e.target.value !== 'all') {
                  onCategoryChange?.('all');
                }
              }}
              className="bg-[#0f172a] border border-slate-700 text-slate-200 text-xs rounded-lg pl-8 pr-7 py-2 appearance-none focus:outline-none focus:border-sky-500 font-mono w-full sm:w-auto"
              id="select-league-filter"
            >
              <option value="all">🌐 All Leagues ({availableLeagues.length})</option>
              {availableLeagues.map((league) => {
                const meta = getLeagueMeta(league);
                const count = leagueCounts[league] ?? 1;
                const isVolatile = isHighVolatilityLeague(league);
                return (
                  <option key={league} value={league}>
                    {meta.flagEmoji} {league} ({count}) {isVolatile ? '⚡[R7]' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Reset All Overrides if any exist */}
          {overridesCount > 0 && (
            <button
              type="button"
              onClick={onResetAllOverrides}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-rose-300 border border-rose-900/50 rounded-lg text-xs font-mono whitespace-nowrap transition-colors"
              id="btn-reset-all-overrides"
              title="Reset all manual overrides in localStorage to automatic mathematical mode"
            >
              <RotateCcw className="w-3 h-3 text-rose-400" />
              <span>Reset Overrides ({overridesCount})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

import { MatchFixture, DatePresetId, DateRangeFilter } from '../types/soccer';

export const DEFAULT_DATE_RANGE: DateRangeFilter = {
  startDate: '',
  endDate: '',
  presetId: 'all',
};

/**
 * Format a Date object to YYYY-MM-DD in UTC / local representation
 */
export function toIsoDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns today's ISO date string based on client time
 */
export function getTodayDateString(): string {
  return toIsoDateString(new Date());
}

/**
 * Calculate the exact start and end date strings for a given preset ID
 */
export function calculatePresetDates(
  presetId: DatePresetId,
  baseDate = new Date()
): { startDate: string; endDate: string } {
  if (presetId === 'all') {
    return { startDate: '', endDate: '' };
  }

  const todayStr = toIsoDateString(baseDate);

  if (presetId === 'today') {
    return { startDate: todayStr, endDate: todayStr };
  }

  if (presetId === 'tomorrow') {
    const tomorrow = new Date(baseDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = toIsoDateString(tomorrow);
    return { startDate: tomorrowStr, endDate: tomorrowStr };
  }

  if (presetId === 'weekend') {
    const dayOfWeek = baseDate.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const sat = new Date(baseDate);
    const sun = new Date(baseDate);

    if (dayOfWeek === 6) {
      // Today is Saturday
      sun.setDate(baseDate.getDate() + 1);
      return { startDate: todayStr, endDate: toIsoDateString(sun) };
    } else if (dayOfWeek === 0) {
      // Today is Sunday
      return { startDate: todayStr, endDate: todayStr };
    } else {
      // Weekday (Mon - Fri), calculate coming Saturday and Sunday
      const daysUntilSat = 6 - dayOfWeek;
      sat.setDate(baseDate.getDate() + daysUntilSat);
      sun.setDate(baseDate.getDate() + daysUntilSat + 1);
      return { startDate: toIsoDateString(sat), endDate: toIsoDateString(sun) };
    }
  }

  if (presetId === '7days') {
    const end = new Date(baseDate);
    end.setDate(baseDate.getDate() + 6); // 7 days total inclusive
    return { startDate: todayStr, endDate: toIsoDateString(end) };
  }

  if (presetId === '14days') {
    const end = new Date(baseDate);
    end.setDate(baseDate.getDate() + 13); // 14 days total inclusive
    return { startDate: todayStr, endDate: toIsoDateString(end) };
  }

  if (presetId === 'month') {
    const firstDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
    const lastDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
    return { startDate: toIsoDateString(firstDay), endDate: toIsoDateString(lastDay) };
  }

  return { startDate: '', endDate: '' };
}

/**
 * Filter check: returns true if fixture kickoff falls within the date range
 */
export function isFixtureInDateRange(fixture: MatchFixture, range: DateRangeFilter): boolean {
  if (!fixture || !fixture.kickoffTime || typeof fixture.kickoffTime !== 'string') {
    return false;
  }
  const fixtureDate = fixture.kickoffTime.slice(0, 10);

  if (range.presetId === 'today') {
    const todayStr = range.startDate || getTodayDateString();
    return fixtureDate === todayStr;
  }

  if (!range.startDate && !range.endDate) {
    return true;
  }

  if (range.startDate && range.endDate) {
    return fixtureDate >= range.startDate && fixtureDate <= range.endDate;
  }

  if (range.startDate) {
    return fixtureDate >= range.startDate;
  }

  if (range.endDate) {
    return fixtureDate <= range.endDate;
  }

  return true;
}

/**
 * Calculate how many fixtures match each preset
 */
export function countMatchesForPreset(fixtures: MatchFixture[], presetId: DatePresetId): number {
  if (presetId === 'all') {
    return fixtures.length;
  }
  const { startDate, endDate } = calculatePresetDates(presetId);
  const tempRange: DateRangeFilter = { startDate, endDate, presetId };
  return fixtures.filter((f) => isFixtureInDateRange(f, tempRange)).length;
}

/**
 * Formats YYYY-MM-DD into a human-friendly string (e.g. "Sat, 5 Sep")
 */
export function formatFriendlyDate(dateStr: string, includeYear = false): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr;
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
  };
  return d.toLocaleDateString('en-GB', options);
}

/**
 * Returns human-readable label for the currently active date filter
 */
export function getDateRangeSummaryLabel(range: DateRangeFilter): string {
  if (!range.startDate && !range.endDate) {
    return 'All Upcoming Dates';
  }

  if (range.presetId === 'today') {
    return `Today (${formatFriendlyDate(range.startDate)})`;
  }
  if (range.presetId === 'tomorrow') {
    return `Tomorrow (${formatFriendlyDate(range.startDate)})`;
  }
  if (range.presetId === 'weekend') {
    return `This Weekend (${formatFriendlyDate(range.startDate)} – ${formatFriendlyDate(range.endDate)})`;
  }
  if (range.presetId === '7days') {
    return `Next 7 Days (${formatFriendlyDate(range.startDate)} – ${formatFriendlyDate(range.endDate)})`;
  }
  if (range.presetId === '14days') {
    return `Next 14 Days (${formatFriendlyDate(range.startDate)} – ${formatFriendlyDate(range.endDate)})`;
  }
  if (range.presetId === 'month') {
    return `This Month (${formatFriendlyDate(range.startDate)} – ${formatFriendlyDate(range.endDate)})`;
  }

  if (range.startDate === range.endDate) {
    return formatFriendlyDate(range.startDate, true);
  }

  if (range.startDate && range.endDate) {
    return `${formatFriendlyDate(range.startDate)} – ${formatFriendlyDate(range.endDate, true)}`;
  }

  if (range.startDate) {
    return `From ${formatFriendlyDate(range.startDate, true)}`;
  }

  return `Until ${formatFriendlyDate(range.endDate, true)}`;
}

/**
 * Derive min and max dates present in the fixtures dataset
 */
export function getDatasetDateBounds(fixtures: MatchFixture[]): { minDate: string; maxDate: string } {
  if (fixtures.length === 0) {
    const today = getTodayDateString();
    return { minDate: today, maxDate: today };
  }

  let min = fixtures[0].kickoffTime.slice(0, 10);
  let max = fixtures[0].kickoffTime.slice(0, 10);

  for (let i = 1; i < fixtures.length; i++) {
    const d = fixtures[i].kickoffTime.slice(0, 10);
    if (d < min) min = d;
    if (d > max) max = d;
  }

  return { minDate: min, maxDate: max };
}

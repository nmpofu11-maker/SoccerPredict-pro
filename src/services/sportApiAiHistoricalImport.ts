/**
 * Historical completed-match importer backed by the authenticated SportAPI.ai API.
 * Never scrapes public web pages or stores odds. One request is made per calendar day,
 * with a bounded range to respect provider quotas.
 */
import {
  fetchSportApiAiFixturesByDate,
  getSportApiAiScores,
  isSportApiAiFixtureFinished,
  isSportApiAiRateLimited,
} from './serverSportApiAi';
import type { ImportedMatchRow } from './historicalImport';

export const SPORTAPI_HISTORY_LIMITS = {
  maxDaysPerSync: 365,
  delayBetweenDaysMs: 75,
} as const;

export interface SportApiHistoryResult {
  rows: ImportedMatchRow[];
  fromDate: string;
  toDate: string;
  daysRequested: number;
  daysFetched: number;
  fixturesSeen: number;
  completedFixtures: number;
  completedWithoutUsableScore: number;
  note?: string;
  error?: string;
  stoppedAt?: string;
}

type FixtureFetcher = (date: string) => Promise<any[]>;

function validIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function teamName(value: any): string {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
  if (value && typeof value.name === 'string') return value.name.replace(/\s+/g, ' ').trim();
  if (value && typeof value.short_name === 'string') return value.short_name.replace(/\s+/g, ' ').trim();
  return '';
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function importSportApiAiHistoricalResults(
  fromDate: string,
  toDate: string,
  opts: {
    fetchFixtures?: FixtureFetcher;
    rateLimited?: () => boolean;
    sleep?: (ms: number) => Promise<void>;
    delayMs?: number;
  } = {},
): Promise<SportApiHistoryResult> {
  if (!validIsoDate(fromDate) || !validIsoDate(toDate)) {
    throw new Error('Start and end dates must be valid dates in YYYY-MM-DD format.');
  }
  if (fromDate > toDate) throw new Error('Start date must be on or before end date.');

  const dayMs = 24 * 60 * 60 * 1000;
  const start = Date.parse(`${fromDate}T00:00:00.000Z`);
  const end = Date.parse(`${toDate}T00:00:00.000Z`);
  const daysRequested = Math.floor((end - start) / dayMs) + 1;
  if (daysRequested > SPORTAPI_HISTORY_LIMITS.maxDaysPerSync) {
    throw new Error(`Choose no more than ${SPORTAPI_HISTORY_LIMITS.maxDaysPerSync} calendar days per sync to respect provider request limits.`);
  }

  const fetchFixtures = opts.fetchFixtures ?? fetchSportApiAiFixturesByDate;
  const rateLimited = opts.rateLimited ?? isSportApiAiRateLimited;
  const sleep = opts.sleep ?? delay;
  const delayMs = opts.delayMs ?? SPORTAPI_HISTORY_LIMITS.delayBetweenDaysMs;
  const result: SportApiHistoryResult = {
    rows: [],
    fromDate,
    toDate,
    daysRequested,
    daysFetched: 0,
    fixturesSeen: 0,
    completedFixtures: 0,
    completedWithoutUsableScore: 0,
  };
  const unique = new Map<string, ImportedMatchRow>();

  for (let offset = 0; offset < daysRequested; offset++) {
    const day = new Date(start + offset * dayMs).toISOString().slice(0, 10);
    try {
      const fixtures = await fetchFixtures(day);
      result.daysFetched++;
      result.fixturesSeen += fixtures.length;

      if (rateLimited()) {
        // The provider helper returns [] on HTTP 429; do not count that attempted date as fetched.
        result.daysFetched = Math.max(0, result.daysFetched - 1);
        result.fixturesSeen = Math.max(0, result.fixturesSeen - fixtures.length);
        result.note = 'SportAPI.ai rate limit reached. Completed results fetched so far were retained; wait for the provider quota to reset before retrying.';
        result.stoppedAt = day;
        break;
      }

      for (const fixture of fixtures) {
        if (!isSportApiAiFixtureFinished(fixture)) continue;
        result.completedFixtures++;

        const home = teamName(fixture?.home_team ?? fixture?.homeTeam);
        const away = teamName(fixture?.away_team ?? fixture?.awayTeam);
        const leagueValue = fixture?.league_name ?? fixture?.competition_name ?? fixture?.league;
        const league = typeof leagueValue === 'string'
          ? leagueValue.trim()
          : typeof leagueValue?.name === 'string' ? leagueValue.name.trim() : '';
        const rawDate = String(fixture?.date ?? fixture?.kickoff_time ?? fixture?.datetime ?? day).slice(0, 10);
        const matchDate = validIsoDate(rawDate) ? rawDate : day;
        const score = getSportApiAiScores(fixture);

        if (!home || !away || !league || normalized(home) === normalized(away) ||
            score.home === null || score.away === null ||
            !Number.isInteger(score.home) || !Number.isInteger(score.away) ||
            score.home < 0 || score.away < 0) {
          result.completedWithoutUsableScore++;
          continue;
        }

        const key = `${normalized(league)}|${matchDate}|${normalized(home)}|${normalized(away)}`;
        unique.set(key, {
          key,
          date: matchDate,
          league,
          home,
          away,
          hg: score.home,
          ag: score.away,
          src: 'SPORTAPI_AI_HISTORICAL',
        });
      }
    } catch (e) {
      result.error = e instanceof Error ? e.message : 'SportAPI.ai historical request failed.';
      result.stoppedAt = day;
      break;
    }

    if (offset < daysRequested - 1 && delayMs > 0) await sleep(delayMs);
  }

  result.rows = [...unique.values()];
  if (result.rows.length === 0 && !result.error && !result.note) {
    result.note = 'No completed fixtures with usable final scores were returned for the selected date range and your API coverage.';
  }
  return result;
}

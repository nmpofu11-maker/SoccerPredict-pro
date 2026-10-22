import test from 'node:test';
import assert from 'node:assert/strict';
import { importSportApiAiHistoricalResults } from '../src/services/sportApiAiHistoricalImport';

test('imports only explicitly completed matches with numeric final scores', async () => {
  const calls: string[] = [];
  const res = await importSportApiAiHistoricalResults('2026-10-21', '2026-10-22', {
    delayMs: 0,
    fetchFixtures: async day => {
      calls.push(day);
      if (day === '2026-10-21') return [
        {
          date: day, status: 'FT', league_name: 'Premier League',
          home_team: 'Arsenal', away_team: 'Leeds United', home_score: 2, away_score: 1,
        },
        {
          date: day, status: 'Scheduled', league_name: 'Premier League',
          home_team: 'Chelsea', away_team: 'Liverpool', home_score: null, away_score: null,
        },
      ];
      return [{
        date: day, status: 'FINISHED', league_name: 'Premier League',
        home_team: 'Chelsea', away_team: 'Liverpool', home_score: null, away_score: null,
      }];
    },
    rateLimited: () => false,
    sleep: async () => {},
  });

  assert.deepEqual(calls, ['2026-10-21', '2026-10-22']);
  assert.equal(res.daysRequested, 2);
  assert.equal(res.daysFetched, 2);
  assert.equal(res.fixturesSeen, 3);
  assert.equal(res.completedFixtures, 2);
  assert.equal(res.completedWithoutUsableScore, 1);
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0].home, 'Arsenal');
  assert.equal(res.rows[0].away, 'Leeds United');
  assert.equal(res.rows[0].hg, 2);
  assert.equal(res.rows[0].ag, 1);
  assert.equal(res.rows[0].src, 'SPORTAPI_AI_HISTORICAL');
});

test('validates the date range and limits each sync to 365 calendar days', async () => {
  await assert.rejects(
    () => importSportApiAiHistoricalResults('2026-02-30', '2026-03-01', { fetchFixtures: async () => [], delayMs: 0 }),
    /valid dates/,
  );
  await assert.rejects(
    () => importSportApiAiHistoricalResults('2026-10-22', '2026-10-21', { fetchFixtures: async () => [], delayMs: 0 }),
    /on or before/,
  );
  await assert.rejects(
    () => importSportApiAiHistoricalResults('2025-01-01', '2026-01-01', { fetchFixtures: async () => [], delayMs: 0 }),
    /no more than 365/,
  );
});

test('retains completed results gathered before an API failure and records the failing date', async () => {
  const res = await importSportApiAiHistoricalResults('2026-10-21', '2026-10-22', {
    delayMs: 0,
    fetchFixtures: async day => {
      if (day === '2026-10-22') throw new Error('API request failed');
      return [{
        date: day, status: 'FT', league_name: 'Serie A',
        home_team: 'Como', away_team: 'Roma', home_score: 1, away_score: 0,
      }];
    },
    rateLimited: () => false,
    sleep: async () => {},
  });
  assert.equal(res.rows.length, 1);
  assert.equal(res.error, 'API request failed');
  assert.equal(res.stoppedAt, '2026-10-22');
  assert.equal(res.daysFetched, 1);
});

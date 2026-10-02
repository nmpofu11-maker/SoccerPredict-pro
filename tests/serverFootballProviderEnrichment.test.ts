import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichFixturesWithFootballApis } from '../src/services/serverFootballProviderEnrichment';

const originalFetch = globalThis.fetch;
const originalEnv = {
  apiKey: process.env.API_FOOTBALL_USE_RAPIDAPI,
  sportmonksKey: process.env.SPORTMONKS_API_KEY,
  apiBase: process.env.API_FOOTBALL_BASE_URL,
  sportmonksBase: process.env.SPORTMONKS_BASE_URL,
};

function restoreEnvironment() {
  globalThis.fetch = originalFetch;
  if (originalEnv.apiKey === undefined) delete process.env.API_FOOTBALL_USE_RAPIDAPI;
  else process.env.API_FOOTBALL_USE_RAPIDAPI = originalEnv.apiKey;
  if (originalEnv.sportmonksKey === undefined) delete process.env.SPORTMONKS_API_KEY;
  else process.env.SPORTMONKS_API_KEY = originalEnv.sportmonksKey;
  if (originalEnv.apiBase === undefined) delete process.env.API_FOOTBALL_BASE_URL;
  else process.env.API_FOOTBALL_BASE_URL = originalEnv.apiBase;
  if (originalEnv.sportmonksBase === undefined) delete process.env.SPORTMONKS_BASE_URL;
  else process.env.SPORTMONKS_BASE_URL = originalEnv.sportmonksBase;
}

test('API-Football fixture, standings, team form and South African H2H are normalized with provenance', async () => {
  process.env.API_FOOTBALL_USE_RAPIDAPI = 'test-rapid-key';
  process.env.SPORTMONKS_API_KEY = 'test-sportmonks-key';
  process.env.API_FOOTBALL_BASE_URL = 'https://api-football.test/v3';
  process.env.SPORTMONKS_BASE_URL = 'https://sportmonks.test/v3/football';

  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/fixtures') && url.searchParams.has('date')) {
      return new Response(JSON.stringify({ response: [{
        fixture: { id: 700, date: '2026-10-10T15:00:00Z', status: { short: 'NS' }, venue: { name: 'FNB Stadium' } },
        league: { id: 288, name: 'Premier Soccer League', country: 'South Africa', season: 2026, round: 'Regular Season' },
        teams: { home: { id: 1, name: 'Orlando Pirates' }, away: { id: 2, name: 'Mamelodi Sundowns' } },
      }] }), { status: 200 });
    }
    if (url.pathname.endsWith('/standings')) {
      return new Response(JSON.stringify({ response: [{ league: { standings: [[
        { team: { id: 1 }, rank: 2, points: 20 },
        { team: { id: 2 }, rank: 1, points: 24 },
      ]] } }] }), { status: 200 });
    }
    if (url.pathname.endsWith('/teams/statistics')) {
      const teamId = url.searchParams.get('team');
      return new Response(JSON.stringify({ response: { form: teamId === '1' ? 'WWDWL' : 'LDWDL' } }), { status: 200 });
    }
    if (url.pathname.endsWith('/fixtures/headtohead')) {
      return new Response(JSON.stringify({ response: [
        { fixture: { date: '2026-09-01T15:00:00Z' }, teams: { home: { id: 1 }, away: { id: 2 } }, goals: { home: 2, away: 0 } },
        { fixture: { date: '2026-08-01T15:00:00Z' }, teams: { home: { id: 2 }, away: { id: 1 } }, goals: { home: 0, away: 1 } },
        { fixture: { date: '2026-07-01T15:00:00Z' }, teams: { home: { id: 1 }, away: { id: 2 } }, goals: { home: 1, away: 1 } },
        { fixture: { date: '2026-06-01T15:00:00Z' }, teams: { home: { id: 2 }, away: { id: 1 } }, goals: { home: 2, away: 0 } },
        { fixture: { date: '2026-05-01T15:00:00Z' }, teams: { home: { id: 1 }, away: { id: 2 } }, goals: { home: 3, away: 0 } },
      ] }), { status: 200 });
    }
    if (url.pathname.includes('/fixtures/date/')) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    throw new Error(`Unexpected provider request: ${url.toString()}`);
  }) as typeof fetch;

  try {
    const result = await enrichFixturesWithFootballApis([], ['2026-10-10']);
    assert.equal(result.apiFootballFixtures, 1);
    assert.equal(result.apiFootballMappedFixtures, 1);
    assert.equal(result.fixtures.length, 1);
    const fixture = result.fixtures[0];
    assert.equal(fixture.homeTeam.name, 'Orlando Pirates');
    assert.equal(fixture.homeTeam.leagueRank, 2);
    assert.equal(fixture.homeTeam.points, 20);
    assert.deepEqual(fixture.homeTeam.form, ['W', 'W', 'D', 'W', 'L']);
    assert.equal(fixture.homeTeam.formSource, 'API_FOOTBALL');
    assert.equal(fixture.awayTeam.leagueRank, 1);
    assert.equal(fixture.awayTeam.formSource, 'API_FOOTBALL');
    assert.deepEqual(fixture.h2h, {
      homeWins: 3,
      draws: 1,
      awayWins: 1,
      totalLast5: 5,
      scoresLast5: ['2-0', '0-1', '1-1', '2-0', '3-0'],
      source: 'API_FOOTBALL',
    });
    assert.equal(result.errors.length, 0);
  } finally {
    restoreEnvironment();
  }
});

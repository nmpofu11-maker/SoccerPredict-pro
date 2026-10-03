import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichFixturesWithFootballApis } from '../src/services/serverFootballProviderEnrichment';
import type { MatchFixture } from '../src/types/soccer';

const originalFetch = globalThis.fetch;
const originalEnv = {
  apiKey: process.env.API_FOOTBALL_USE_RAPIDAPI,
  apiFootballKey: process.env.API_FOOTBALL_KEY,
  sportmonksKey: process.env.SPORTMONKS_API_KEY,
  sportmonksToken: process.env.SPORTMONKS_API_TOKEN,
  sportApiKey: process.env.SPORTAPI_AI_KEY,
  sportApiFallback: process.env.SPORTAPI_API_KEY,
  apiBase: process.env.API_FOOTBALL_BASE_URL,
  sportmonksBase: process.env.SPORTMONKS_BASE_URL,
};

function restoreEnvironment() {
  globalThis.fetch = originalFetch;
  if (originalEnv.apiKey === undefined) delete process.env.API_FOOTBALL_USE_RAPIDAPI;
  else process.env.API_FOOTBALL_USE_RAPIDAPI = originalEnv.apiKey;
  if (originalEnv.apiFootballKey === undefined) delete process.env.API_FOOTBALL_KEY;
  else process.env.API_FOOTBALL_KEY = originalEnv.apiFootballKey;
  if (originalEnv.sportmonksKey === undefined) delete process.env.SPORTMONKS_API_KEY;
  else process.env.SPORTMONKS_API_KEY = originalEnv.sportmonksKey;
  if (originalEnv.sportmonksToken === undefined) delete process.env.SPORTMONKS_API_TOKEN;
  else process.env.SPORTMONKS_API_TOKEN = originalEnv.sportmonksToken;
  if (originalEnv.sportApiKey === undefined) delete process.env.SPORTAPI_AI_KEY;
  else process.env.SPORTAPI_AI_KEY = originalEnv.sportApiKey;
  if (originalEnv.sportApiFallback === undefined) delete process.env.SPORTAPI_API_KEY;
  else process.env.SPORTAPI_API_KEY = originalEnv.sportApiFallback;
  if (originalEnv.apiBase === undefined) delete process.env.API_FOOTBALL_BASE_URL;
  else process.env.API_FOOTBALL_BASE_URL = originalEnv.apiBase;
  if (originalEnv.sportmonksBase === undefined) delete process.env.SPORTMONKS_BASE_URL;
  else process.env.SPORTMONKS_BASE_URL = originalEnv.sportmonksBase;
}

test('API-Football fixture, standings, team form and South African H2H are normalized with provenance', async () => {
  process.env.API_FOOTBALL_USE_RAPIDAPI = 'test-rapid-key';
  delete process.env.SPORTMONKS_API_KEY;
  delete process.env.SPORTMONKS_API_TOKEN;
  process.env.API_FOOTBALL_BASE_URL = 'https://api-football.test/v3';
  process.env.SPORTMONKS_BASE_URL = 'https://sportmonks.test/v3/football';

  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.host.includes('sportmonks')) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    if (url.pathname.endsWith('/fixtures') && url.searchParams.has('date')) {
      return new Response(JSON.stringify({ response: [{
        fixture: { id: 700, date: '2026-10-10T15:00:00Z', status: { short: 'NS' }, venue: { name: 'FNB Stadium' } },
        league: { id: 288, name: 'Premier Soccer League', country: 'South Africa', season: 2026, round: 'Regular Season' },
        teams: { home: { id: 1, name: 'Orlando Pirates' }, away: { id: 2, name: 'Mamelodi Sundowns' } },
      }, {
        fixture: { id: 701, date: '2026-10-10T13:00:00Z', status: { short: 'FT' }, venue: { name: 'Old Ground' } },
        league: { id: 288, name: 'Premier Soccer League', country: 'South Africa', season: 2026 },
        teams: { home: { id: 3, name: 'Finished FC' }, away: { id: 4, name: 'Old United' } },
      }, {
        fixture: { id: 702, date: '2026-10-10', status: { short: 'NS' }, venue: { name: 'Date Only Ground' } },
        league: { id: 288, name: 'Premier Soccer League', country: 'South Africa', season: 2026 },
        teams: { home: { id: 5, name: 'No Time FC' }, away: { id: 6, name: 'No Time United' } },
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
    const result = await enrichFixturesWithFootballApis([], ['2026-10-10'], { enableSportmonks: false, enableSportApiAi: false });
    assert.equal(result.apiFootballFixtures, 3);
    assert.equal(result.apiFootballMappedFixtures, 1);
    assert.equal(result.fixtures.length, 1);
    const fixture = result.fixtures[0];
    assert.equal(fixture.homeTeam.name, 'Orlando Pirates');
    assert.equal(fixture.homeTeam.leagueRank, 2);
    assert.equal(fixture.homeTeam.points, 20);
    assert.equal(fixture.homeTeam.standingsSource, 'API_FOOTBALL');
    assert.deepEqual(fixture.homeTeam.form, ['W', 'W', 'D', 'W', 'L']);
    assert.equal(fixture.homeTeam.formSource, 'API_FOOTBALL');
    assert.equal(fixture.awayTeam.leagueRank, 1);
    assert.equal(fixture.awayTeam.standingsSource, 'API_FOOTBALL');
    assert.equal(fixture.awayTeam.formSource, 'API_FOOTBALL');
    assert.deepEqual(fixture.h2h, {
      homeWins: 3,
      draws: 1,
      awayWins: 1,
      totalLast5: 5,
      scoresLast5: ['2-0', '0-1', '1-1', '2-0', '3-0'],
      source: 'API_FOOTBALL',
    });
    assert.deepEqual(result.errors, []);
  } finally {
    restoreEnvironment();
  }
});


test('SportAPI.ai supplies verified standings, form, match stats and H2H without API-Football', async () => {
  delete process.env.API_FOOTBALL_USE_RAPIDAPI;
  delete process.env.API_FOOTBALL_KEY;
  delete process.env.SPORTMONKS_API_KEY;
  delete process.env.SPORTMONKS_API_TOKEN;
  process.env.SPORTAPI_AI_KEY = 'test-sportapi-key';
  delete process.env.SPORTMONKS_API_KEY;
  process.env.SPORT_PROVIDER_MAX_TEAM_LOOKUPS = '4';
  process.env.SPORT_PROVIDER_MAX_H2H_LOOKUPS = '4';
  process.env.SPORT_PROVIDER_MAX_MATCH_STAT_LOOKUPS = '12';

  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.host.includes('sportmonks')) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    if (url.pathname.endsWith('/fixtures/date/2026-10-10')) {
      return new Response(JSON.stringify({ success: true, fixtures: [] }), { status: 200 });
    }
    if (url.pathname.endsWith('/standings/77')) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          standings: [
            { position: 2, team_id: 101, team_name: 'Home FC', points: 19, form: ['W','W','D','L','W'] },
            { position: 5, team_id: 202, team_name: 'Away FC', points: 14, form: ['L','D','W','D','L'] },
          ],
        },
      }), { status: 200 });
    }
    if (url.pathname.endsWith('/teams/101')) {
      return new Response(JSON.stringify({
        team: { id: 101, name: 'Home FC' },
        matches: [
          { id: 1001, datetime: '2026-10-02T15:00:00Z', status: 'FT', home_team: { id: 101, name: 'Home FC' }, away_team: { id: 301, name: 'Rivals A' }, home_score: 2, away_score: 0 },
          { id: 1002, datetime: '2026-09-26T15:00:00Z', status: 'FT', home_team: { id: 302, name: 'Rivals B' }, away_team: { id: 101, name: 'Home FC' }, home_score: 1, away_score: 1 },
          { id: 1003, datetime: '2026-09-19T15:00:00Z', status: 'FT', home_team: { id: 101, name: 'Home FC' }, away_team: { id: 303, name: 'Rivals C' }, home_score: 3, away_score: 1 },
        ],
      }), { status: 200 });
    }
    if (url.pathname.endsWith('/teams/202')) {
      return new Response(JSON.stringify({
        team: { id: 202, name: 'Away FC' },
        matches: [
          { id: 2001, datetime: '2026-10-01T15:00:00Z', status: 'FT', home_team: { id: 401, name: 'Rivals D' }, away_team: { id: 202, name: 'Away FC' }, home_score: 1, away_score: 2 },
          { id: 2002, datetime: '2026-09-24T15:00:00Z', status: 'FT', home_team: { id: 202, name: 'Away FC' }, away_team: { id: 402, name: 'Rivals E' }, home_score: 0, away_score: 2 },
          { id: 2003, datetime: '2026-09-17T15:00:00Z', status: 'FT', home_team: { id: 403, name: 'Rivals F' }, away_team: { id: 202, name: 'Away FC' }, home_score: 0, away_score: 0 },
        ],
      }), { status: 200 });
    }
    if (url.pathname.endsWith('/fixtures/1001/stats')) {
      return new Response(JSON.stringify({ data: { home: { possession: 60, shots_on_target: 7 }, away: { possession: 40, shots_on_target: 2 } } }), { status: 200 });
    }
    if (url.pathname.endsWith('/fixtures/1002/stats')) {
      return new Response(JSON.stringify({ data: { home: { possession: 48, shots_on_target: 4 }, away: { possession: 52, shots_on_target: 5 } } }), { status: 200 });
    }
    if (url.pathname.endsWith('/fixtures/1003/stats')) {
      return new Response(JSON.stringify({ data: { home: { possession: 58, shots_on_target: 6 }, away: { possession: 42, shots_on_target: 3 } } }), { status: 200 });
    }
    if (url.pathname.endsWith('/fixtures/2001/stats')) {
      return new Response(JSON.stringify({ data: { home: { possession: 46, shots_on_target: 3 }, away: { possession: 54, shots_on_target: 5 } } }), { status: 200 });
    }
    if (url.pathname.endsWith('/fixtures/2002/stats')) {
      return new Response(JSON.stringify({ data: { home: { possession: 55, shots_on_target: 5 }, away: { possession: 45, shots_on_target: 4 } } }), { status: 200 });
    }
    if (url.pathname.endsWith('/fixtures/2003/stats')) {
      return new Response(JSON.stringify({ data: { home: { possession: 50, shots_on_target: 4 }, away: { possession: 50, shots_on_target: 4 } } }), { status: 200 });
    }
    if (url.pathname.endsWith('/fixtures/h2h/101/202')) {
      return new Response(JSON.stringify({
        summary: { total_matches: 3, team1_wins: 2, team2_wins: 0, draws: 1 },
        fixtures: [
          { id: 9001, datetime: '2026-08-01T15:00:00Z', status: 'FT', home_team: { id: 101, name: 'Home FC' }, away_team: { id: 202, name: 'Away FC' }, home_score: 2, away_score: 0 },
          { id: 9002, datetime: '2026-05-01T15:00:00Z', status: 'FT', home_team: { id: 202, name: 'Away FC' }, away_team: { id: 101, name: 'Home FC' }, home_score: 1, away_score: 1 },
          { id: 9003, datetime: '2026-02-01T15:00:00Z', status: 'FT', home_team: { id: 101, name: 'Home FC' }, away_team: { id: 202, name: 'Away FC' }, home_score: 3, away_score: 1 },
        ],
      }), { status: 200 });
    }
    throw new Error('Unexpected SportAPI request: ' + url.toString());
  }) as typeof fetch;

  const fixture: MatchFixture = {
    id: 'sportapi_fixture_1',
    kickoffTime: '2026-10-10T15:00:00Z',
    league: 'Premier League',
    venue: 'Test Ground',
    isHighStakes: false,
    motivation: 'regular',
    sportApiAiFixtureId: '7001',
    sportApiAiLeagueId: 77,
    sportApiAiHomeTeamId: 101,
    sportApiAiAwayTeamId: 202,
    homeTeam: { id: 'home', name: 'Home FC', shortName: 'HOM', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null },
    awayTeam: { id: 'away', name: 'Away FC', shortName: 'AWA', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null },
    h2h: null,
  };

  try {
    const result = await enrichFixturesWithFootballApis([fixture], ['2026-10-10'], { enableApiFootball: false, enableSportmonks: false });
    const out = result.fixtures[0];
    assert.equal(out.homeTeam.leagueRank, 2);
    assert.equal(out.awayTeam.leagueRank, 5);
    assert.deepEqual(out.homeTeam.form, ['W','W','D','L','W']);
    assert.equal(out.homeTeam.formSource, 'SPORTAPI_AI');
    assert.equal(out.homeTeam.avgPossession, 55.3);
    assert.equal(out.homeTeam.avgShotsOnTarget, 5.7);
    assert.equal(out.homeTeam.matchStatsSource, 'SPORTAPI_AI');
    assert.equal(out.awayTeam.avgPossession, 43.3);
    assert.equal(out.awayTeam.avgShotsOnTarget, 3);
    assert.equal(out.awayTeam.matchStatsSource, 'SPORTAPI_AI');
    assert.equal(out.h2h?.source, 'SPORTAPI_AI');
    assert.equal(out.h2h?.homeWins, 2);
    assert.equal(out.h2h?.draws, 1);
    assert.equal(out.h2h?.awayWins, 0);
  } finally {
    restoreEnvironment();
    delete process.env.SPORT_PROVIDER_MAX_TEAM_LOOKUPS;
    delete process.env.SPORT_PROVIDER_MAX_H2H_LOOKUPS;
    delete process.env.SPORT_PROVIDER_MAX_MATCH_STAT_LOOKUPS;
  }
});

test('Sportmonks supplies verified form, standings, possession, shots-on-target and xG from participant-linked matches', async () => {
  delete process.env.API_FOOTBALL_USE_RAPIDAPI;
  delete process.env.SPORTAPI_AI_KEY;
  process.env.SPORTMONKS_API_KEY = 'test-sportmonks-key';
  process.env.SPORT_PROVIDER_MAX_TEAM_LOOKUPS = '4';
  process.env.SPORT_PROVIDER_MAX_H2H_LOOKUPS = '4';

  const makeSmMatch = (id: number, date: string, homeId: number, awayId: number, hg: number, ag: number, hp: number, ap: number, hs: number, as: number, hxg: number, axg: number) => ({
    id,
    starting_at: date,
    state: { short_name: 'FT' },
    participants: [
      { id: homeId, name: homeId === 101 ? 'Home FC' : 'Opponent ' + homeId, meta: { location: 'home' } },
      { id: awayId, name: awayId === 202 ? 'Away FC' : 'Opponent ' + awayId, meta: { location: 'away' } },
    ],
    scores: {
      data: [
        { description: 'CURRENT', score: { participant: 'home', goals: hg } },
        { description: 'CURRENT', score: { participant: 'away', goals: ag } },
      ],
    },
    statistics: {
      data: [
        { participant_id: homeId, type: { id: 45, code: 'BALL_POSSESSION' }, data: { value: hp } },
        { participant_id: awayId, type: { id: 45, code: 'BALL_POSSESSION' }, data: { value: ap } },
        { participant_id: homeId, type: { id: 86, code: 'SHOTS_ON_TARGET' }, data: { value: hs } },
        { participant_id: awayId, type: { id: 86, code: 'SHOTS_ON_TARGET' }, data: { value: as } },
      ],
    },
    xGFixture: { data: { home: hxg, away: axg } },
  });

  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/fixtures/date/')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    if (url.pathname.includes('/fixtures/between/')) {
      const teamId = url.pathname.split('/').pop();
      if (teamId === '101') {
        return new Response(JSON.stringify({ data: [
          makeSmMatch(3001, '2026-10-02T15:00:00Z', 101, 301, 2, 0, 60, 40, 7, 2, 1.8, 0.5),
          makeSmMatch(3002, '2026-09-25T15:00:00Z', 302, 101, 1, 1, 48, 52, 4, 5, 1.1, 1.1),
          makeSmMatch(3003, '2026-09-18T15:00:00Z', 101, 303, 3, 1, 58, 42, 6, 3, 1.6, 0.7),
        ] }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [
        makeSmMatch(4001, '2026-10-01T15:00:00Z', 401, 202, 1, 2, 46, 54, 3, 5, 0.8, 1.4),
        makeSmMatch(4002, '2026-09-24T15:00:00Z', 202, 402, 0, 2, 55, 45, 5, 4, 1.2, 1.6),
        makeSmMatch(4003, '2026-09-17T15:00:00Z', 403, 202, 0, 0, 50, 50, 4, 4, 0.7, 0.7),
      ] }), { status: 200 });
    }
    if (url.pathname.endsWith('/standings/seasons/900')) {
      return new Response(JSON.stringify({ data: [
        { participant_id: 101, position: 2, points: 19 },
        { participant_id: 202, position: 5, points: 14 },
      ] }), { status: 200 });
    }
    if (url.pathname.endsWith('/fixtures/head-to-head/101/202')) {
      return new Response(JSON.stringify({ data: [
        makeSmMatch(5001, '2026-08-01T15:00:00Z', 101, 202, 2, 0, 55, 45, 6, 2, 1.7, 0.6),
        makeSmMatch(5002, '2026-05-01T15:00:00Z', 202, 101, 1, 1, 48, 52, 4, 5, 0.9, 1.1),
      ] }), { status: 200 });
    }
    throw new Error('Unexpected Sportmonks request: ' + url.toString());
  }) as typeof fetch;

  const fixture: MatchFixture = {
    id: 'sportmonks_fixture_1',
    kickoffTime: '2026-10-10T15:00:00Z',
    league: 'South African Premiership',
    venue: 'Test Ground',
    isHighStakes: false,
    motivation: 'regular',
    sportMonksSeasonId: 900,
    sportmonksFixtureId: '8001',
    sportmonksLeagueId: 88,
    sportmonksHomeTeamId: 101,
    sportmonksAwayTeamId: 202,
    homeTeam: { id: 'home', name: 'Home FC', shortName: 'HOM', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null },
    awayTeam: { id: 'away', name: 'Away FC', shortName: 'AWA', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null },
    h2h: null,
  };

  try {
    const result = await enrichFixturesWithFootballApis([fixture], ['2026-10-10'], { enableApiFootball: false, enableSportApiAi: false });
    const out = result.fixtures[0];
    assert.equal(out.homeTeam.leagueRank, 2);
    assert.equal(out.homeTeam.standingsSource, 'SPORTMONKS');
    assert.deepEqual(out.homeTeam.form, ['W','D','W']);
    assert.equal(out.homeTeam.formSource, 'SPORTMONKS');
    assert.equal(out.homeTeam.avgPossession, 56.7);
    assert.equal(out.homeTeam.avgShotsOnTarget, 6);
    assert.equal(out.homeTeam.matchStatsSource, 'SPORTMONKS');
    assert.equal(out.homeTeam.expectedGoalsAvg, 1.5);
    assert.equal(out.homeTeam.advancedStatsSource, 'SPORTMONKS');
    assert.equal(out.h2h?.homeWins, 1);
    assert.equal(out.h2h?.draws, 1);
    assert.equal(out.h2h?.awayWins, 0);
    assert.equal(out.h2h?.source, 'SPORTMONKS');
  } finally {
    restoreEnvironment();
    delete process.env.SPORT_PROVIDER_MAX_TEAM_LOOKUPS;
    delete process.env.SPORT_PROVIDER_MAX_H2H_LOOKUPS;
  }
});


test('Sportmonks team-search fallback enriches historical evidence when current-date fixtures are unavailable', async () => {
  delete process.env.API_FOOTBALL_USE_RAPIDAPI;
  delete process.env.SPORTAPI_AI_KEY;
  process.env.SPORTMONKS_API_KEY = 'test-sportmonks-key';
  process.env.SPORT_PROVIDER_MAX_TEAM_SEARCH_LOOKUPS = '4';
  process.env.SPORT_PROVIDER_MAX_TEAM_LOOKUPS = '4';

  const makeMatch = (id: number, date: string, homeId: number, awayId: number, hg: number, ag: number) => ({
    id,
    starting_at: date,
    state: { data: { short_name: 'FT' } },
    participants: [
      { id: homeId, name: homeId === 111 ? 'Search Home FC' : 'Opponent ' + homeId, meta: { location: 'home' } },
      { id: awayId, name: awayId === 222 ? 'Search Away FC' : 'Opponent ' + awayId, meta: { location: 'away' } },
    ],
    scores: { data: [
      { description: 'CURRENT', score: { participant: 'home', goals: hg } },
      { description: 'CURRENT', score: { participant: 'away', goals: ag } },
    ] },
    statistics: { data: [
      { participant_id: homeId, type: { id: 45, code: 'BALL_POSSESSION' }, data: { value: 60 } },
      { participant_id: awayId, type: { id: 45, code: 'BALL_POSSESSION' }, data: { value: 40 } },
    ] },
  });

  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/fixtures/date/')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    if (url.pathname.includes('/teams/search/')) {
      const last = decodeURIComponent(url.pathname.split('/').pop() || '');
      const id = last === 'Search Home FC' ? 111 : 222;
      return new Response(JSON.stringify({ data: [{ id, name: last, type: 'domestic' }] }), { status: 200 });
    }
    if (url.pathname.endsWith('/fixtures/between/2026-06-12/2026-10-09/111')) {
      return new Response(JSON.stringify({ data: [
        makeMatch(6101, '2026-10-01T15:00:00Z', 111, 311, 2, 0),
        makeMatch(6102, '2026-09-24T15:00:00Z', 312, 111, 1, 1),
        makeMatch(6103, '2026-09-17T15:00:00Z', 111, 313, 3, 1),
      ] }), { status: 200 });
    }
    if (url.pathname.endsWith('/fixtures/between/2026-06-12/2026-10-09/222')) {
      return new Response(JSON.stringify({ data: [
        makeMatch(6201, '2026-10-02T15:00:00Z', 421, 222, 0, 2),
        makeMatch(6202, '2026-09-25T15:00:00Z', 222, 422, 0, 1),
        makeMatch(6203, '2026-09-18T15:00:00Z', 423, 222, 1, 1),
      ] }), { status: 200 });
    }
    throw new Error('Unexpected Sportmonks search-fallback request: ' + url.toString());
  }) as typeof fetch;

  const fixture: MatchFixture = {
    id: 'sportmonks_search_fixture',
    kickoffTime: '2026-10-10T15:00:00Z',
    league: 'English Premier League',
    venue: 'Test Ground',
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: { id: 'home', name: 'Search Home FC', shortName: 'SHF', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null },
    awayTeam: { id: 'away', name: 'Search Away FC', shortName: 'SAF', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null },
    h2h: null,
  };

  try {
    const result = await enrichFixturesWithFootballApis([fixture], ['2026-10-10'], { enableApiFootball: false, enableSportApiAi: false });
    const out = result.fixtures[0];
    assert.equal(out.sportmonksHomeTeamId, 111);
    assert.equal(out.sportmonksAwayTeamId, 222);
    assert.deepEqual(out.homeTeam.form, ['W', 'D', 'W']);
    assert.equal(out.homeTeam.formSource, 'SPORTMONKS');
  } finally {
    restoreEnvironment();
    delete process.env.SPORT_PROVIDER_MAX_TEAM_SEARCH_LOOKUPS;
    delete process.env.SPORT_PROVIDER_MAX_TEAM_LOOKUPS;
  }
});
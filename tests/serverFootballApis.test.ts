import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiFootballConfigured,
  sportmonksConfigured,
  fetchApiFootballFixturesByDate,
  fetchSportmonksFixturesByDate,
} from '../src/services/serverFootballApis';

const originalFetch = globalThis.fetch;
const originalEnv = {
  apiFootball: process.env.API_FOOTBALL_USE_RAPIDAPI,
  sportmonks: process.env.SPORTMONKS_API_KEY,
  apiFootballBase: process.env.API_FOOTBALL_BASE_URL,
  sportmonksBase: process.env.SPORTMONKS_BASE_URL,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEnv.apiFootball === undefined) delete process.env.API_FOOTBALL_USE_RAPIDAPI;
  else process.env.API_FOOTBALL_USE_RAPIDAPI = originalEnv.apiFootball;
  if (originalEnv.sportmonks === undefined) delete process.env.SPORTMONKS_API_KEY;
  else process.env.SPORTMONKS_API_KEY = originalEnv.sportmonks;
  if (originalEnv.apiFootballBase === undefined) delete process.env.API_FOOTBALL_BASE_URL;
  else process.env.API_FOOTBALL_BASE_URL = originalEnv.apiFootballBase;
  if (originalEnv.sportmonksBase === undefined) delete process.env.SPORTMONKS_BASE_URL;
  else process.env.SPORTMONKS_BASE_URL = originalEnv.sportmonksBase;
});

describe('server football provider clients', () => {
  it('reports configured state from Cloud Run secret-backed environment variables', () => {
    process.env.API_FOOTBALL_USE_RAPIDAPI = 'rapid-key';
    process.env.SPORTMONKS_API_KEY = 'monks-key';
    assert.equal(apiFootballConfigured(), true);
    assert.equal(sportmonksConfigured(), true);
  });

  it('uses RapidAPI headers and parses API-Football fixture results', async () => {
    process.env.API_FOOTBALL_USE_RAPIDAPI = 'rapid-key';
    process.env.API_FOOTBALL_BASE_URL = 'https://api-football.test/v3';
    let capturedUrl = '';
    let capturedHeaders: HeadersInit | undefined;
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({ response: [{ fixture: { id: 123 } }] }), { status: 200 });
    }) as typeof fetch;

    const fixtures = await fetchApiFootballFixturesByDate('2026-10-02');
    assert.equal(fixtures.length, 1);
    assert.match(capturedUrl, /fixtures\?date=2026-10-02/);
    assert.equal((capturedHeaders as Record<string, string>)['x-rapidapi-key'], 'rapid-key');
  });

  it('uses the raw-token Authorization header without exposing the token in the URL', async () => {
    process.env.SPORTMONKS_API_KEY = 'monks-key';
    process.env.SPORTMONKS_BASE_URL = 'https://sportmonks.test/v3/football';
    let capturedUrl = '';
    let capturedHeaders: HeadersInit | undefined;
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({ data: [{ id: 456 }] }), { status: 200 });
    }) as typeof fetch;

    const fixtures = await fetchSportmonksFixturesByDate('2026-10-02');
    assert.equal(fixtures[0].id, 456);
    assert.doesNotMatch(capturedUrl, /api_token|monks-key/);
    assert.match(capturedUrl, /fixtures\/date\/2026-10-02/);
    assert.equal((capturedHeaders as Record<string, string>).Authorization, 'monks-key');
  });

  it('blocks repeated calls for a rejected key but permits a rotated key without a 24-hour cooldown', async () => {
    process.env.SPORTMONKS_API_KEY = 'rejected-monks-key';
    process.env.SPORTMONKS_BASE_URL = 'https://sportmonks.test/v3/football';
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ message: 'Invalid token provided' }), { status: 401 });
    }) as typeof fetch;

    await fetchSportmonksFixturesByDate('2026-10-02');
    assert.equal(sportmonksConfigured(), false);
    await fetchSportmonksFixturesByDate('2026-10-03');
    assert.equal(calls, 1, 'invalid credential should not trigger repeated API requests');

    process.env.SPORTMONKS_API_KEY = 'rotated-monks-key';
    assert.equal(sportmonksConfigured(), true);

    let rotatedCalls = 0;
    globalThis.fetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      rotatedCalls++;
      assert.equal((init?.headers as Record<string, string>).Authorization, 'rotated-monks-key');
      return new Response(JSON.stringify({ data: [{ id: 789 }] }), { status: 200 });
    }) as typeof fetch;
    const fixtures = await fetchSportmonksFixturesByDate('2026-10-04');
    assert.equal(rotatedCalls, 1);
    assert.equal(fixtures[0].id, 789);
  });

  it('rejects invalid dates before making provider requests', async () => {
    process.env.API_FOOTBALL_USE_RAPIDAPI = 'rapid-key';
    await assert.rejects(fetchApiFootballFixturesByDate('02-10-2026'), /YYYY-MM-DD/);
  });

  it('maps and enriches MLS and Concacaf competitions from provider feeds', async () => {
    const { enrichFixturesWithFootballApis } = await import('../src/services/serverFootballProviderEnrichment');
    process.env.API_FOOTBALL_USE_RAPIDAPI = 'rapid-key';
    process.env.API_FOOTBALL_BASE_URL = 'https://api-football.test/v3';

    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes('/fixtures?date=')) {
        return new Response(JSON.stringify({
          response: [
            {
              fixture: { id: 991, date: '2026-10-15T19:00:00Z', status: { short: 'NS' } },
              league: { id: 253, name: 'Major League Soccer', country: 'USA', season: 2026 },
              teams: {
                home: { id: 1599, name: 'Seattle Sounders' },
                away: { id: 1600, name: 'Sporting KC' },
              },
            },
            {
              fixture: { id: 992, date: '2026-10-15T21:00:00Z', status: { short: 'NS' } },
              league: { id: 9, name: 'Concacaf Nations League', country: 'World', season: 2026 },
              teams: {
                home: { id: 2201, name: 'Curaçao' },
                away: { id: 2202, name: 'Trinidad and Tobago' },
              },
            },
          ],
        }), { status: 200 });
      }
      if (url.includes('/standings')) {
        return new Response(JSON.stringify({
          response: [
            {
              league: {
                standings: [[
                  { team: { id: 1599 }, rank: 3, points: 45 },
                  { team: { id: 1600 }, rank: 11, points: 28 },
                ]],
              },
            },
          ],
        }), { status: 200 });
      }
      if (url.includes('/teams/statistics')) {
        return new Response(JSON.stringify({
          response: {
            form: 'WWDWL',
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ response: [] }), { status: 200 });
    }) as typeof fetch;

    const baseFixtures = [
      {
        id: 'mls_test_1',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'USA • US Major League Soccer',
        homeTeam: { id: 't1', name: 'Seattle Sounders', shortName: 'SEA', leagueRank: null, points: null, form: [] },
        awayTeam: { id: 't2', name: 'Sporting KC', shortName: 'SKC', leagueRank: null, points: null, form: [] },
      } as any,
    ];

    const res = await enrichFixturesWithFootballApis(baseFixtures, ['2026-10-15'], {
      enableApiFootball: true,
      enableSportmonks: false,
      enableSportApiAi: false,
    });

    assert.equal(res.apiFootballMappedFixtures, 2);
    const enrichedMLS = res.fixtures.find(f => f.id === 'mls_test_1');
    assert.ok(enrichedMLS);
    assert.equal(enrichedMLS.homeTeam.leagueRank, 3);
    assert.equal(enrichedMLS.homeTeam.points, 45);
    assert.equal(enrichedMLS.homeTeam.standingsSource, 'API_FOOTBALL');
    assert.deepEqual(enrichedMLS.homeTeam.form, ['W', 'W', 'D', 'W', 'L']);
    assert.equal(enrichedMLS.homeTeam.formSource, 'API_FOOTBALL');
  });

  it('rejects unrelated competition even with positive league ID', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const candidate = {
      raw: {
        fixture: { id: 101 },
        league: { id: 9999, name: 'Random Unrelated Local Tournament', season: 2026 },
        teams: {
          home: { id: 10, name: 'Arsenal' },
          away: { id: 20, name: 'Chelsea' },
        },
      },
      mapped: {
        id: 'api_101',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'Random Unrelated Local Tournament',
        competition: 'Random Unrelated Local Tournament',
        homeTeam: { name: 'Arsenal' },
        awayTeam: { name: 'Chelsea' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [candidate]);
    assert.equal(match, null, 'Unrelated competition must be rejected');
  });

  it('rejects ambiguous candidates when multiple conflicting competitions exist for same teams on same date', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const candidates = [
      {
        raw: {
          fixture: { id: 101 },
          league: { id: 39, name: 'Premier League', season: 2026 },
          teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
        },
        mapped: {
          id: 'api_101',
          kickoffTime: '2026-10-15T19:00:00Z',
          league: 'English Premier League',
          competition: 'Premier League',
          homeTeam: { name: 'Arsenal' },
          awayTeam: { name: 'Chelsea' },
        } as any,
      },
      {
        raw: {
          fixture: { id: 102 },
          league: { id: 45, name: 'FA Cup', season: 2026 },
          teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
        },
        mapped: {
          id: 'api_102',
          kickoffTime: '2026-10-15T19:00:00Z',
          league: 'FA Cup',
          competition: 'FA Cup',
          homeTeam: { name: 'Arsenal' },
          awayTeam: { name: 'Chelsea' },
        } as any,
      },
    ];

    // Candidate 1 matches Premier League; Candidate 2 FA Cup is rejected by competition compatibility
    // The unambiguous Premier League match is safely selected
    const match = findUniqueMatchingCandidate(slateFixture, candidates);
    assert.ok(match);
    assert.equal(match.raw.fixture.id, 101);
  });

  it('safely handles identical duplicate candidates deterministically', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const duplicateCandidate = {
      raw: {
        fixture: { id: 101 },
        league: { id: 39, name: 'Premier League', season: 2026 },
        teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
      },
      mapped: {
        id: 'api_101',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal' },
        awayTeam: { name: 'Chelsea' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [duplicateCandidate, duplicateCandidate]);
    assert.ok(match);
    assert.equal(match.raw.fixture.id, 101);
  });

  it('rejects reversed home and away teams', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const reversedCandidate = {
      raw: {
        fixture: { id: 101 },
        league: { id: 39, name: 'Premier League', season: 2026 },
        teams: { home: { id: 49, name: 'Chelsea' }, away: { id: 42, name: 'Arsenal' } },
      },
      mapped: {
        id: 'api_101',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Chelsea' },
        awayTeam: { name: 'Arsenal' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [reversedCandidate]);
    assert.equal(match, null, 'Reversed home and away teams must be rejected');
  });

  it('rejects incompatible kickoff time beyond 3 hours', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T12:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const lateCandidate = {
      raw: {
        fixture: { id: 101 },
        league: { id: 39, name: 'Premier League', season: 2026 },
        teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
      },
      mapped: {
        id: 'api_101',
        kickoffTime: '2026-10-15T20:00:00Z', // 8 hours later
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal' },
        awayTeam: { name: 'Chelsea' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [lateCandidate]);
    assert.equal(match, null, 'Incompatible kickoff time (>3h delta) must be rejected');
  });

  it('rejects invalid or mismatched season', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const wrongSeasonCandidate = {
      raw: {
        fixture: { id: 101 },
        league: { id: 39, name: 'Premier League', season: 2018 }, // Outdated season
        teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
      },
      mapped: {
        id: 'api_101',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal' },
        awayTeam: { name: 'Chelsea' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [wrongSeasonCandidate]);
    assert.equal(match, null, 'Outdated season must be rejected');
  });

  it('1. Sportmonks participants correctly match an existing slate fixture', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f_sm_1',
      kickoffTime: '2026-10-15T18:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const smCandidate = {
      raw: {
        id: 7771,
        starting_at: '2026-10-15T18:00:00Z',
        league: { id: 8, name: 'Premier League' },
        participants: [
          { id: 501, name: 'Arsenal', meta: { location: 'home' } },
          { id: 502, name: 'Chelsea', meta: { location: 'away' } },
        ],
      },
      mapped: {
        id: 'sportmonks_7771',
        kickoffTime: '2026-10-15T18:00:00Z',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal' },
        awayTeam: { name: 'Chelsea' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [smCandidate]);
    assert.ok(match);
    assert.equal(match.raw.id, 7771);
  });

  it('2. Sportmonks reversed participants are rejected', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f_sm_2',
      kickoffTime: '2026-10-15T18:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const reversedSmCandidate = {
      raw: {
        id: 7772,
        starting_at: '2026-10-15T18:00:00Z',
        league: { id: 8, name: 'Premier League' },
        participants: [
          { id: 502, name: 'Chelsea', meta: { location: 'home' } },
          { id: 501, name: 'Arsenal', meta: { location: 'away' } },
        ],
      },
      mapped: {
        id: 'sportmonks_7772',
        kickoffTime: '2026-10-15T18:00:00Z',
        competition: 'Premier League',
        homeTeam: { name: 'Chelsea' },
        awayTeam: { name: 'Arsenal' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [reversedSmCandidate]);
    assert.equal(match, null);
  });

  it('3. Sportmonks missing participant IDs are rejected for ID attachment', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f_sm_3',
      kickoffTime: '2026-10-15T18:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const invalidSmCandidate = {
      raw: {
        id: 7773,
        starting_at: '2026-10-15T18:00:00Z',
        league: { id: 8, name: 'Premier League' },
        participants: [
          { id: null, name: 'Arsenal', meta: { location: 'home' } },
          { id: 502, name: 'Chelsea', meta: { location: 'away' } },
        ],
      },
      mapped: {
        id: 'sportmonks_7773',
        kickoffTime: '2026-10-15T18:00:00Z',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal' },
        awayTeam: { name: 'Chelsea' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [invalidSmCandidate]);
    assert.equal(match, null);
  });

  it('4. API-Football matching continues to work', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f_apif',
      kickoffTime: '2026-10-15T15:00:00Z',
      league: 'Spanish La Liga',
      competition: 'La Liga',
      homeTeam: { name: 'Real Madrid', shortName: 'RMA' },
      awayTeam: { name: 'Barcelona', shortName: 'BAR' },
    } as any;

    const candidate = {
      raw: {
        fixture: { id: 303 },
        league: { id: 140, name: 'La Liga', season: 2026 },
        teams: {
          home: { id: 541, name: 'Real Madrid' },
          away: { id: 529, name: 'Barcelona' },
        },
      },
      mapped: {
        id: 'api_303',
        kickoffTime: '2026-10-15T15:00:00Z',
        competition: 'La Liga',
        homeTeam: { name: 'Real Madrid' },
        awayTeam: { name: 'Barcelona' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [candidate]);
    assert.ok(match);
    assert.equal(match.raw.fixture.id, 303);
  });

  it('5. Same teams and date in different competitions remain separate fixtures', async () => {
    const { enrichFixturesWithFootballApis } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixtures = [
      {
        id: 'fix_league',
        kickoffTime: '2026-10-15T15:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { id: 't1', name: 'Arsenal', shortName: 'ARS', leagueRank: null, points: null, form: [] },
        awayTeam: { id: 't2', name: 'Chelsea', shortName: 'CHE', leagueRank: null, points: null, form: [] },
      },
      {
        id: 'fix_cup',
        kickoffTime: '2026-10-15T20:00:00Z',
        league: 'English FA Cup',
        competition: 'FA Cup',
        homeTeam: { id: 't1', name: 'Arsenal', shortName: 'ARS', leagueRank: null, points: null, form: [] },
        awayTeam: { id: 't2', name: 'Chelsea', shortName: 'CHE', leagueRank: null, points: null, form: [] },
      },
    ] as any;

    process.env.API_FOOTBALL_USE_RAPIDAPI = 'rapid-key';
    process.env.API_FOOTBALL_BASE_URL = 'https://api-football.test/v3';
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes('/fixtures?date=')) {
        return new Response(JSON.stringify({
          response: [
            {
              fixture: { id: 10, date: '2026-10-15T15:00:00Z', status: { short: 'NS' } },
              league: { id: 39, name: 'Premier League', season: 2026 },
              teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
            },
            {
              fixture: { id: 11, date: '2026-10-15T20:00:00Z', status: { short: 'NS' } },
              league: { id: 45, name: 'FA Cup', season: 2026 },
              teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
            },
          ],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ response: [] }), { status: 200 });
    }) as typeof fetch;

    const res = await enrichFixturesWithFootballApis(slateFixtures, ['2026-10-15'], { enableApiFootball: true, enableSportmonks: false, enableSportApiAi: false });
    assert.equal(res.fixtures.length, 2);
    const leagueMatch = res.fixtures.find(f => f.id === 'fix_league');
    const cupMatch = res.fixtures.find(f => f.id === 'fix_cup');
    assert.equal(leagueMatch.apiFootballFixtureId, '10');
    assert.equal(cupMatch.apiFootballFixtureId, '11');
  });

  it('6. Same teams and competition on the same date with different kickoffs do not collapse', async () => {
    const { enrichFixturesWithFootballApis } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixtures = [
      {
        id: 'fix_early',
        kickoffTime: '2026-10-15T12:30:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { id: 't1', name: 'Liverpool', shortName: 'LIV', leagueRank: null, points: null, form: [] },
        awayTeam: { id: 't2', name: 'Everton', shortName: 'EVE', leagueRank: null, points: null, form: [] },
      },
      {
        id: 'fix_late',
        kickoffTime: '2026-10-15T17:30:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { id: 't1', name: 'Liverpool', shortName: 'LIV', leagueRank: null, points: null, form: [] },
        awayTeam: { id: 't2', name: 'Everton', shortName: 'EVE', leagueRank: null, points: null, form: [] },
      },
    ] as any;

    process.env.API_FOOTBALL_USE_RAPIDAPI = 'rapid-key';
    process.env.API_FOOTBALL_BASE_URL = 'https://api-football.test/v3';
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes('/fixtures?date=')) {
        return new Response(JSON.stringify({
          response: [
            {
              fixture: { id: 20, date: '2026-10-15T12:30:00Z', status: { short: 'NS' } },
              league: { id: 39, name: 'Premier League', season: 2026 },
              teams: { home: { id: 40, name: 'Liverpool' }, away: { id: 45, name: 'Everton' } },
            },
            {
              fixture: { id: 21, date: '2026-10-15T17:30:00Z', status: { short: 'NS' } },
              league: { id: 39, name: 'Premier League', season: 2026 },
              teams: { home: { id: 40, name: 'Liverpool' }, away: { id: 45, name: 'Everton' } },
            },
          ],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ response: [] }), { status: 200 });
    }) as typeof fetch;

    const res = await enrichFixturesWithFootballApis(slateFixtures, ['2026-10-15'], { enableApiFootball: true, enableSportmonks: false, enableSportApiAi: false });
    assert.equal(res.fixtures.length, 2);
  });

  it('7. Duplicate fixture and league IDs with conflicting team IDs are rejected', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const c1 = {
      raw: { fixture: { id: 555 }, league: { id: 39, name: 'Premier League', season: 2026 }, teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } } },
      mapped: { id: 'api_555', kickoffTime: '2026-10-15T19:00:00Z', competition: 'Premier League', homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Chelsea' } } as any,
    };
    const c2 = {
      raw: { fixture: { id: 555 }, league: { id: 39, name: 'Premier League', season: 2026 }, teams: { home: { id: 999, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } } },
      mapped: { id: 'api_555', kickoffTime: '2026-10-15T19:00:00Z', competition: 'Premier League', homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Chelsea' } } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [c1, c2]);
    assert.equal(match, null);
  });

  it('8. Duplicate fixture and league IDs with conflicting kickoff times are rejected', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const c1 = {
      raw: { fixture: { id: 556 }, league: { id: 39, name: 'Premier League', season: 2026 }, teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } } },
      mapped: { id: 'api_556', kickoffTime: '2026-10-15T19:00:00Z', competition: 'Premier League', homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Chelsea' } } as any,
    };
    const c2 = {
      raw: { fixture: { id: 556 }, league: { id: 39, name: 'Premier League', season: 2026 }, teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } } },
      mapped: { id: 'api_556', kickoffTime: '2026-10-15T21:00:00Z', competition: 'Premier League', homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Chelsea' } } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [c1, c2]);
    assert.equal(match, null);
  });

  it('9. Two candidates that both pass individual checks but remain ambiguous are rejected', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const c1 = {
      raw: { fixture: { id: 601 }, league: { id: 39, name: 'Premier League', season: 2026 }, teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } } },
      mapped: { id: 'api_601', kickoffTime: '2026-10-15T19:00:00Z', competition: 'Premier League', homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Chelsea' } } as any,
    };
    const c2 = {
      raw: { fixture: { id: 602 }, league: { id: 39, name: 'Premier League', season: 2026 }, teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } } },
      mapped: { id: 'api_602', kickoffTime: '2026-10-15T19:00:00Z', competition: 'Premier League', homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Chelsea' } } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [c1, c2]);
    assert.equal(match, null);
  });

  it('10. Wrong home-team ID or wrong away-team ID is rejected', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const badIdCandidate = {
      raw: { fixture: { id: 101 }, league: { id: 39, name: 'Premier League', season: 2026 }, teams: { home: { id: -5, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } } },
      mapped: { id: 'api_101', kickoffTime: '2026-10-15T19:00:00Z', competition: 'Premier League', homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Chelsea' } } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [badIdCandidate]);
    assert.equal(match, null);
  });

  it('11. Missing and non-year season values are handled safely', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const nonYearSeasonCandidate = {
      raw: { fixture: { id: 101 }, league: { id: 39, name: 'Premier League', season: 21841 }, teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } } },
      mapped: { id: 'api_101', kickoffTime: '2026-10-15T19:00:00Z', competition: 'Premier League', homeTeam: { name: 'Arsenal' }, awayTeam: { name: 'Chelsea' } } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [nonYearSeasonCandidate]);
    assert.ok(match, 'Non-year season entity ID should not trigger calendar year bounds rejection');
  });

  it('12. Provider ID namespaces remain separate', async () => {
    const { enrichFixturesWithFootballApis } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixtures = [
      {
        id: 'fix_sep',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { id: 't1', name: 'Arsenal', shortName: 'ARS', leagueRank: null, points: null, form: [] },
        awayTeam: { id: 't2', name: 'Chelsea', shortName: 'CHE', leagueRank: null, points: null, form: [] },
      },
    ] as any;

    process.env.API_FOOTBALL_USE_RAPIDAPI = 'rapid-key';
    process.env.API_FOOTBALL_BASE_URL = 'https://api-football.test/v3';
    process.env.SPORTMONKS_API_KEY = 'monks-key';
    process.env.SPORTMONKS_BASE_URL = 'https://sportmonks.test/v3/football';

    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes('api-football.test')) {
        return new Response(JSON.stringify({
          response: [{
            fixture: { id: 701, date: '2026-10-15T19:00:00Z', status: { short: 'NS' } },
            league: { id: 39, name: 'Premier League', season: 2026 },
            teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
          }]
        }), { status: 200 });
      }
      if (url.includes('sportmonks.test')) {
        return new Response(JSON.stringify({
          data: [{
            id: 801,
            starting_at: '2026-10-15T19:00:00Z',
            league: { id: 8, name: 'Premier League' },
            participants: [
              { id: 91, name: 'Arsenal', meta: { location: 'home' } },
              { id: 92, name: 'Chelsea', meta: { location: 'away' } },
            ],
          }]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ response: [], data: [] }), { status: 200 });
    }) as typeof fetch;

    const res = await enrichFixturesWithFootballApis(slateFixtures, ['2026-10-15'], { enableApiFootball: true, enableSportmonks: true, enableSportApiAi: false });
    const f = res.fixtures[0];
    assert.equal(f.apiFootballFixtureId, '701');
    assert.equal(f.sportmonksFixtureId, '801');
    assert.equal(f.apiFootballHomeTeamId, 42);
    assert.equal(f.sportmonksHomeTeamId, 91);
    assert.notEqual(f.apiFootballHomeTeamId, f.sportmonksHomeTeamId);
  });

  it('13. No BSD IDs or BSD evidence enter this implementation', async () => {
    const { enrichFixturesWithFootballApis } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixtures = [
      {
        id: 'fix_bsd',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { id: 't1', name: 'Arsenal', shortName: 'ARS', leagueRank: null, points: null, form: [] },
        awayTeam: { id: 't2', name: 'Chelsea', shortName: 'CHE', leagueRank: null, points: null, form: [] },
      },
    ] as any;

    const res = await enrichFixturesWithFootballApis(slateFixtures, ['2026-10-15'], { enableApiFootball: false, enableSportmonks: false, enableSportApiAi: false });
    const f = res.fixtures[0];
    assert.equal((f as any).bsdFixtureId, undefined);
    assert.equal(f.homeTeam.standingsSource, undefined);
  });

  it('14. Existing competition alias behaviour remains intact', async () => {
    const { areCompetitionsCompatible } = await import('../src/services/serverFootballProviderEnrichment');
    assert.equal(areCompetitionsCompatible('English Premier League', 'Premier League', 'Premier League', 'England'), true);
    assert.equal(areCompetitionsCompatible('USA • US Major League Soccer', 'Major League Soccer', 'Major League Soccer', 'USA'), true);
  });

  it('15. Same teams, same kickoff hour, different competitions', async () => {
    const { enrichFixturesWithFootballApis } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixtures = [
      {
        id: 'fix_league',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { id: 't1', name: 'Arsenal', shortName: 'ARS', leagueRank: null, points: null, form: [] },
        awayTeam: { id: 't2', name: 'Chelsea', shortName: 'CHE', leagueRank: null, points: null, form: [] },
      },
      {
        id: 'fix_cup',
        kickoffTime: '2026-10-15T19:30:00Z',
        league: 'English FA Cup',
        competition: 'FA Cup',
        homeTeam: { id: 't1', name: 'Arsenal', shortName: 'ARS', leagueRank: null, points: null, form: [] },
        awayTeam: { id: 't2', name: 'Chelsea', shortName: 'CHE', leagueRank: null, points: null, form: [] },
      },
    ] as any;

    process.env.API_FOOTBALL_USE_RAPIDAPI = 'rapid-key';
    process.env.API_FOOTBALL_BASE_URL = 'https://api-football.test/v3';
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      return new Response(JSON.stringify({
        response: [
          {
            fixture: { id: 10, date: '2026-10-15T19:00:00Z', status: { short: 'NS' } },
            league: { id: 39, name: 'Premier League', season: 2026 },
            teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
          },
          {
            fixture: { id: 11, date: '2026-10-15T19:30:00Z', status: { short: 'NS' } },
            league: { id: 45, name: 'FA Cup', season: 2026 },
            teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
          },
        ],
      }), { status: 200 });
    }) as typeof fetch;

    const res = await enrichFixturesWithFootballApis(slateFixtures, ['2026-10-15'], { enableApiFootball: true, enableSportmonks: false, enableSportApiAi: false });
    assert.equal(res.fixtures.length, 2);
    const leagueMatch = res.fixtures.find(f => f.id === 'fix_league');
    const cupMatch = res.fixtures.find(f => f.id === 'fix_cup');
    assert.equal(leagueMatch.apiFootballFixtureId, '10');
    assert.equal(cupMatch.apiFootballFixtureId, '11');
  });

  it('16. Same teams and competition, two different kickoffs within the same hour', async () => {
    const { enrichFixturesWithFootballApis } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixtures = [
      {
        id: 'fix_early',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { id: 't1', name: 'Arsenal', shortName: 'ARS', leagueRank: null, points: null, form: [] },
        awayTeam: { id: 't2', name: 'Chelsea', shortName: 'CHE', leagueRank: null, points: null, form: [] },
      },
      {
        id: 'fix_late',
        kickoffTime: '2026-10-15T19:45:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { id: 't1', name: 'Arsenal', shortName: 'ARS', leagueRank: null, points: null, form: [] },
        awayTeam: { id: 't2', name: 'Chelsea', shortName: 'CHE', leagueRank: null, points: null, form: [] },
      },
    ] as any;

    process.env.API_FOOTBALL_USE_RAPIDAPI = 'rapid-key';
    process.env.API_FOOTBALL_BASE_URL = 'https://api-football.test/v3';
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      return new Response(JSON.stringify({
        response: [
          {
            fixture: { id: 20, date: '2026-10-15T19:00:00Z', status: { short: 'NS' } },
            league: { id: 39, name: 'Premier League', season: 2026 },
            teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
          },
          {
            fixture: { id: 21, date: '2026-10-15T19:45:00Z', status: { short: 'NS' } },
            league: { id: 39, name: 'Premier League', season: 2026 },
            teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
          },
        ],
      }), { status: 200 });
    }) as typeof fetch;

    const res = await enrichFixturesWithFootballApis(slateFixtures, ['2026-10-15'], { enableApiFootball: true, enableSportmonks: false, enableSportApiAi: false });
    assert.equal(res.fixtures.length, 2);
    const early = res.fixtures.find(f => f.id === 'fix_early');
    const late = res.fixtures.find(f => f.id === 'fix_late');
    assert.equal(early.apiFootballFixtureId, '20');
    assert.equal(late.apiFootballFixtureId, '21');
  });

  it('17. Preservation of all original slate fixtures when fixture keys collide', async () => {
    const { enrichFixturesWithFootballApis } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixtures = [
      {
        id: 'fix_1',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { id: 't1', name: 'Arsenal', shortName: 'ARS', leagueRank: null, points: null, form: [] },
        awayTeam: { id: 't2', name: 'Chelsea', shortName: 'CHE', leagueRank: null, points: null, form: [] },
      },
      {
        id: 'fix_2',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English FA Cup',
        competition: 'FA Cup',
        homeTeam: { id: 't1', name: 'Arsenal', shortName: 'ARS', leagueRank: null, points: null, form: [] },
        awayTeam: { id: 't2', name: 'Chelsea', shortName: 'CHE', leagueRank: null, points: null, form: [] },
      },
    ] as any;

    process.env.API_FOOTBALL_USE_RAPIDAPI = 'rapid-key';
    process.env.API_FOOTBALL_BASE_URL = 'https://api-football.test/v3';
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      return new Response(JSON.stringify({ response: [] }), { status: 200 });
    }) as typeof fetch;

    const res = await enrichFixturesWithFootballApis(slateFixtures, ['2026-10-15'], { enableApiFootball: true, enableSportmonks: false, enableSportApiAi: false });
    assert.equal(res.fixtures.length, 2);
    assert.ok(res.fixtures.find(f => f.id === 'fix_1'));
    assert.ok(res.fixtures.find(f => f.id === 'fix_2'));
  });

  it('18. API-Football candidate missing raw home team name is rejected', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const candidate = {
      raw: {
        fixture: { id: 101 },
        league: { id: 39, name: 'Premier League', season: 2026 },
        teams: {
          home: { id: 42, name: null },
          away: { id: 49, name: 'Chelsea' },
        },
      },
      mapped: {
        id: 'api_101',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal' },
        awayTeam: { name: 'Chelsea' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [candidate]);
    assert.equal(match, null);
  });

  it('19. API-Football candidate missing raw away team name is rejected', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const candidate = {
      raw: {
        fixture: { id: 101 },
        league: { id: 39, name: 'Premier League', season: 2026 },
        teams: {
          home: { id: 42, name: 'Arsenal' },
          away: { id: 49, name: '' },
        },
      },
      mapped: {
        id: 'api_101',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal' },
        awayTeam: { name: 'Chelsea' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [candidate]);
    assert.equal(match, null);
  });

  it('20. Sportmonks candidate missing raw participant name is rejected', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const smCandidate = {
      raw: {
        id: 7771,
        starting_at: '2026-10-15T19:00:00Z',
        league: { id: 8, name: 'Premier League' },
        participants: [
          { id: 501, name: undefined, meta: { location: 'home' } },
          { id: 502, name: 'Chelsea', meta: { location: 'away' } },
        ],
      },
      mapped: {
        id: 'sportmonks_7771',
        kickoffTime: '2026-10-15T19:00:00Z',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal' },
        awayTeam: { name: 'Chelsea' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [smCandidate]);
    assert.equal(match, null);
  });

  it('21. Sportmonks participants.data with conflicting IDs is rejected', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const c1 = {
      raw: {
        id: 7771,
        starting_at: '2026-10-15T19:00:00Z',
        league: { id: 8, name: 'Premier League' },
        participants: {
          data: [
            { id: 501, name: 'Arsenal', meta: { location: 'home' } },
            { id: 502, name: 'Chelsea', meta: { location: 'away' } },
          ]
        }
      },
      mapped: {
        id: 'sportmonks_7771',
        kickoffTime: '2026-10-15T19:00:00Z',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal' },
        awayTeam: { name: 'Chelsea' },
      } as any,
    };

    const c2 = {
      raw: {
        id: 7771,
        starting_at: '2026-10-15T19:00:00Z',
        league: { id: 8, name: 'Premier League' },
        participants: {
          data: [
            { id: 999, name: 'Arsenal', meta: { location: 'home' } },
            { id: 502, name: 'Chelsea', meta: { location: 'away' } },
          ]
        }
      },
      mapped: {
        id: 'sportmonks_7771',
        kickoffTime: '2026-10-15T19:00:00Z',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal' },
        awayTeam: { name: 'Chelsea' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [c1, c2]);
    assert.equal(match, null);
  });

  it('22. Sportmonks participants in reversed array order but correct meta.location', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const smCandidate = {
      raw: {
        id: 7771,
        starting_at: '2026-10-15T19:00:00Z',
        league: { id: 8, name: 'Premier League' },
        participants: [
          { id: 502, name: 'Chelsea', meta: { location: 'away' } },
          { id: 501, name: 'Arsenal', meta: { location: 'home' } },
        ],
      },
      mapped: {
        id: 'sportmonks_7771',
        kickoffTime: '2026-10-15T19:00:00Z',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal' },
        awayTeam: { name: 'Chelsea' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [smCandidate]);
    assert.ok(match);
    assert.equal(match.raw.id, 7771);
  });

  it('23. Sportmonks duplicate comparison using meta.location rather than positional IDs', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const c1 = {
      raw: {
        id: 7771,
        starting_at: '2026-10-15T19:00:00Z',
        league: { id: 8, name: 'Premier League' },
        participants: [
          { id: 501, name: 'Arsenal', meta: { location: 'home' } },
          { id: 502, name: 'Chelsea', meta: { location: 'away' } },
        ],
      },
      mapped: {
        id: 'sportmonks_7771',
        kickoffTime: '2026-10-15T19:00:00Z',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal' },
        awayTeam: { name: 'Chelsea' },
      } as any,
    };

    const c2 = {
      raw: {
        id: 7771,
        starting_at: '2026-10-15T19:00:00Z',
        league: { id: 8, name: 'Premier League' },
        participants: [
          { id: 502, name: 'Chelsea', meta: { location: 'away' } },
          { id: 501, name: 'Arsenal', meta: { location: 'home' } },
        ],
      },
      mapped: {
        id: 'sportmonks_7771',
        kickoffTime: '2026-10-15T19:00:00Z',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal' },
        awayTeam: { name: 'Chelsea' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [c1, c2]);
    assert.ok(match);
    assert.equal(match.raw.id, 7771);
  });

  it('24. Positive but incorrect provider team IDs where the provider identity evidence conflicts are rejected', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const conflictingCandidate = {
      raw: {
        fixture: { id: 101 },
        league: { id: 39, name: 'Premier League', season: 2026 },
        teams: {
          home: { id: 42, name: 'Tottenham' },
          away: { id: 49, name: 'Chelsea' },
        },
      },
      mapped: {
        id: 'api_101',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Tottenham' },
        awayTeam: { name: 'Chelsea' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [conflictingCandidate]);
    assert.equal(match, null);
  });

  it('25. Invalid or missing slate kickoff is rejected', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: 'invalid-kickoff',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const candidate = {
      raw: {
        fixture: { id: 101 },
        league: { id: 39, name: 'Premier League', season: 2026 },
        teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
      },
      mapped: {
        id: 'api_101',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal' },
        awayTeam: { name: 'Chelsea' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [candidate]);
    assert.equal(match, null);
  });

  it('26. Invalid or missing provider kickoff is rejected', async () => {
    const { findUniqueMatchingCandidate } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixture = {
      id: 'f1',
      kickoffTime: '2026-10-15T19:00:00Z',
      league: 'English Premier League',
      competition: 'Premier League',
      homeTeam: { name: 'Arsenal', shortName: 'ARS' },
      awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    } as any;

    const candidate = {
      raw: {
        fixture: { id: 101 },
        league: { id: 39, name: 'Premier League', season: 2026 },
        teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
      },
      mapped: {
        id: 'api_101',
        kickoffTime: 'invalid-kickoff',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal' },
        awayTeam: { name: 'Chelsea' },
      } as any,
    };

    const match = findUniqueMatchingCandidate(slateFixture, [candidate]);
    assert.equal(match, null);
  });

  it('27. isValidPositiveInteger helper validation', async () => {
    const { isValidPositiveInteger } = await import('../src/services/serverFootballProviderEnrichment');
    assert.equal(isValidPositiveInteger(123), true);
    assert.equal(isValidPositiveInteger("456"), true);
    assert.equal(isValidPositiveInteger(0), false);
    assert.equal(isValidPositiveInteger(-5), false);
    assert.equal(isValidPositiveInteger(12.3), false);
    assert.equal(isValidPositiveInteger("abc"), false);
    assert.equal(isValidPositiveInteger(undefined), false);
    assert.equal(isValidPositiveInteger(null), false);
    assert.equal(isValidPositiveInteger(NaN), false);
  });

  it('28. Sportmonks historical match sorting callback regression', async () => {
    const { enrichFixturesWithFootballApis } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixtures = [
      {
        id: 'fix_sm_sort',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal', leagueRank: null, points: null, form: [] },
        awayTeam: { name: 'Chelsea', leagueRank: null, points: null, form: [] },
        sportmonksFixtureId: '801',
        sportmonksHomeTeamId: 91,
        sportmonksAwayTeamId: 92,
      },
    ] as any;

    process.env.SPORTMONKS_API_KEY = 'monks-key';
    process.env.SPORTMONKS_BASE_URL = 'https://sportmonks.test/v3/football';

    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes('sportmonks.test')) {
        return new Response(JSON.stringify({
          data: [
            {
              id: 9001,
              starting_at: '2026-10-01T15:00:00Z',
              state: { name: 'FT', short: 'FT' },
              scores: [{ score: { participant: 'home', value: 2 } }, { score: { participant: 'away', value: 1 } }],
              participants: [
                { id: 91, name: 'Arsenal', meta: { location: 'home' } },
                { id: 100, name: 'Leeds', meta: { location: 'away' } },
              ],
            },
            {
              id: 9002,
              starting_at: '2026-10-05T15:00:00Z',
              state: { name: 'FT', short: 'FT' },
              scores: [{ score: { participant: 'home', value: 1 } }, { score: { participant: 'away', value: 1 } }],
              participants: [
                { id: 91, name: 'Arsenal', meta: { location: 'home' } },
                { id: 101, name: 'Everton', meta: { location: 'away' } },
              ],
            },
          ]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch;

    const res = await enrichFixturesWithFootballApis(slateFixtures, ['2026-10-15'], {
      enableApiFootball: false,
      enableSportmonks: true,
      enableSportApiAi: false,
    });
    assert.ok(res.fixtures[0].homeTeam.scheduleSource === 'SPORTMONKS');
  });

  it('29. SportAPI.ai ID recovery validates positive integers and rejects invalid IDs', async () => {
    const { enrichFixturesWithFootballApis } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixtures = [
      {
        id: 'fix_invalid_id',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal', leagueRank: null, points: null, form: [] },
        awayTeam: { name: 'Chelsea', leagueRank: null, points: null, form: [] },
      },
    ] as any;

    process.env.SPORTAPI_AI_KEY = 'sportapi-key';
    process.env.SPORTAPI_AI_BASE_URL = 'https://sportapi.test';

    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes('sportapi.test')) {
        return new Response(JSON.stringify({
          data: [
            {
              id: -101,
              league_id: 12.3,
              home_id: 0,
              away_id: "abc",
              home_team: { name: 'Arsenal' },
              away_team: { name: 'Chelsea' },
              league: { name: 'Premier League' },
              datetime: '2026-10-15T19:00:00Z',
            }
          ]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch;

    const res = await enrichFixturesWithFootballApis(slateFixtures, ['2026-10-15'], {
      enableApiFootball: false,
      enableSportmonks: false,
      enableSportApiAi: true,
    });
    const f = res.fixtures[0];
    assert.equal(f.sportApiAiFixtureId, undefined);
    assert.equal(f.sportApiAiLeagueId, undefined);
    assert.equal(f.sportApiAiHomeTeamId, undefined);
    assert.equal(f.sportApiAiAwayTeamId, undefined);
  });

  it('30. SportAPI.ai ID recovery does not overwrite existing valid ID with invalid recovered value', async () => {
    const { enrichFixturesWithFootballApis } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixtures = [
      {
        id: 'fix_overwrite',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal', leagueRank: null, points: null, form: [] },
        awayTeam: { name: 'Chelsea', leagueRank: null, points: null, form: [] },
        sportApiAiFixtureId: '999',
      },
    ] as any;

    process.env.SPORTAPI_AI_KEY = 'sportapi-key';
    process.env.SPORTAPI_AI_BASE_URL = 'https://sportapi.test';

    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes('sportapi.test')) {
        return new Response(JSON.stringify({
          data: [
            {
              id: -5,
              home_team: { name: 'Arsenal' },
              away_team: { name: 'Chelsea' },
              league: { name: 'Premier League' },
              datetime: '2026-10-15T19:00:00Z',
            }
          ]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch;

    const res = await enrichFixturesWithFootballApis(slateFixtures, ['2026-10-15'], {
      enableApiFootball: false,
      enableSportmonks: false,
      enableSportApiAi: true,
    });
    const f = res.fixtures[0];
    assert.equal(f.sportApiAiFixtureId, '999');
  });

  it('31. Candidate reuse check ensures a single provider fixture ID cannot be attached to two different slate fixtures', async () => {
    const { enrichFixturesWithFootballApis } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixtures = [
      {
        id: 'fix_1',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal', leagueRank: null, points: null, form: [] },
        awayTeam: { name: 'Chelsea', leagueRank: null, points: null, form: [] },
      },
      {
        id: 'fix_2',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal', leagueRank: null, points: null, form: [] },
        awayTeam: { name: 'Chelsea', leagueRank: null, points: null, form: [] },
      },
    ] as any;

    process.env.API_FOOTBALL_USE_RAPIDAPI = 'rapid-key';
    process.env.API_FOOTBALL_BASE_URL = 'https://api-football.test/v3';

    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes('api-football.test')) {
        return new Response(JSON.stringify({
          response: [
            {
              fixture: { id: 701, date: '2026-10-15T19:00:00Z', status: { short: 'NS' } },
              league: { id: 39, name: 'Premier League', season: 2026 },
              teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
            }
          ]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ response: [], data: [] }), { status: 200 });
    }) as typeof fetch;

    const res = await enrichFixturesWithFootballApis(slateFixtures, ['2026-10-15'], {
      enableApiFootball: true,
      enableSportmonks: false,
      enableSportApiAi: false,
    });
    
    const f1 = res.fixtures.find(f => f.id === 'fix_1');
    const f2 = res.fixtures.find(f => f.id === 'fix_2');
    
    const matchesCount = [f1?.apiFootballFixtureId, f2?.apiFootballFixtureId].filter(id => id === '701').length;
    assert.equal(matchesCount, 1);
  });

  it('32. SportAPI.ai recovery rejects conflicting candidates instead of keeping one', async () => {
    const { enrichFixturesWithFootballApis } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixtures = [
      {
        id: 'fix_conflict',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal', leagueRank: null, points: null, form: [] },
        awayTeam: { name: 'Chelsea', leagueRank: null, points: null, form: [] },
      },
    ] as any;

    process.env.SPORTAPI_AI_KEY = 'sportapi-key';
    process.env.SPORTAPI_AI_BASE_URL = 'https://sportapi.test';

    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes('sportapi.test')) {
        return new Response(JSON.stringify({
          data: [
            {
              id: 801,
              league_id: 10,
              home_id: 91,
              away_id: 92,
              home_team: { name: 'Arsenal' },
              away_team: { name: 'Chelsea' },
              league: { name: 'Premier League' },
              datetime: '2026-10-15T19:00:00Z',
            },
            {
              id: 802, // Conflicting ID!
              league_id: 10,
              home_id: 91,
              away_id: 92,
              home_team: { name: 'Arsenal' },
              away_team: { name: 'Chelsea' },
              league: { name: 'Premier League' },
              datetime: '2026-10-15T19:00:00Z',
            }
          ]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch;

    const res = await enrichFixturesWithFootballApis(slateFixtures, ['2026-10-15'], {
      enableApiFootball: false,
      enableSportmonks: false,
      enableSportApiAi: true,
    });
    const f = res.fixtures[0];
    assert.equal(f.sportApiAiFixtureId, undefined); // Rejected completely due to conflict!
  });

  it('33. Candidate matching rejects when raw provider-supplied team names are absent', async () => {
    const { enrichFixturesWithFootballApis } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixtures = [
      {
        id: 'fix_raw_name',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal', leagueRank: null, points: null, form: [] },
        awayTeam: { name: 'Chelsea', leagueRank: null, points: null, form: [] },
      },
    ] as any;

    process.env.API_FOOTBALL_USE_RAPIDAPI = 'rapid-key';
    process.env.API_FOOTBALL_BASE_URL = 'https://api-football.test/v3';

    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes('api-football.test')) {
        return new Response(JSON.stringify({
          response: [
            {
              fixture: { id: 701, date: '2026-10-15T19:00:00Z', status: { short: 'NS' } },
              league: { id: 39, name: 'Premier League', season: 2026 },
              teams: {
                home: { id: 42, name: null }, // Missing raw home name!
                away: { id: 49, name: 'Chelsea' },
              },
            }
          ]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ response: [] }), { status: 200 });
    }) as typeof fetch;

    const res = await enrichFixturesWithFootballApis(slateFixtures, ['2026-10-15'], {
      enableApiFootball: true,
      enableSportmonks: false,
      enableSportApiAi: false,
    });
    const f = res.fixtures[0];
    assert.equal(f.apiFootballFixtureId, undefined); // Candidate match rejected because of absent raw team name!
  });

  it('34. Candidate matching rejects if candidate or fixture kickoff timestamp is invalid', async () => {
    const { enrichFixturesWithFootballApis } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixtures = [
      {
        id: 'fix_invalid_kickoff',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal', leagueRank: null, points: null, form: [] },
        awayTeam: { name: 'Chelsea', leagueRank: null, points: null, form: [] },
      },
    ] as any;

    process.env.API_FOOTBALL_USE_RAPIDAPI = 'rapid-key';
    process.env.API_FOOTBALL_BASE_URL = 'https://api-football.test/v3';

    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes('api-football.test')) {
        return new Response(JSON.stringify({
          response: [
            {
              fixture: { id: 701, date: 'invalid-kickoff-date', status: { short: 'NS' } }, // Invalid candidate kickoff!
              league: { id: 39, name: 'Premier League', season: 2026 },
              teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
            }
          ]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ response: [] }), { status: 200 });
    }) as typeof fetch;

    const res = await enrichFixturesWithFootballApis(slateFixtures, ['2026-10-15'], {
      enableApiFootball: true,
      enableSportmonks: false,
      enableSportApiAi: false,
    });
    const f = res.fixtures[0];
    assert.equal(f.apiFootballFixtureId, undefined); // Rejected due to invalid kickoff!
  });

  it('35. SportAPI.ai recovery enforces one-to-one matching and prevents candidate reuse', async () => {
    const { enrichFixturesWithFootballApis } = await import('../src/services/serverFootballProviderEnrichment');
    const slateFixtures = [
      {
        id: 'fix_first',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal', leagueRank: null, points: null, form: [] },
        awayTeam: { name: 'Chelsea', leagueRank: null, points: null, form: [] },
      },
      {
        id: 'fix_second',
        kickoffTime: '2026-10-15T19:00:00Z',
        league: 'English Premier League',
        competition: 'Premier League',
        homeTeam: { name: 'Arsenal', leagueRank: null, points: null, form: [] },
        awayTeam: { name: 'Chelsea', leagueRank: null, points: null, form: [] },
      },
    ] as any;

    process.env.SPORTAPI_AI_KEY = 'sportapi-key';
    process.env.SPORTAPI_AI_BASE_URL = 'https://sportapi.test';

    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes('sportapi.test')) {
        return new Response(JSON.stringify({
          data: [
            {
              id: 801,
              league_id: 10,
              home_id: 91,
              away_id: 92,
              home_team: { name: 'Arsenal' },
              away_team: { name: 'Chelsea' },
              league: { name: 'Premier League' },
              datetime: '2026-10-15T19:00:00Z',
            }
          ]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch;

    const res = await enrichFixturesWithFootballApis(slateFixtures, ['2026-10-15'], {
      enableApiFootball: false,
      enableSportmonks: false,
      enableSportApiAi: true,
    });
    const f1 = res.fixtures.find(f => f.id === 'fix_first');
    const f2 = res.fixtures.find(f => f.id === 'fix_second');
    
    // Only one should have recovered the candidate ID
    const count = [f1?.sportApiAiFixtureId, f2?.sportApiAiFixtureId].filter(id => id === '801').length;
    assert.equal(count, 1);
  });
});

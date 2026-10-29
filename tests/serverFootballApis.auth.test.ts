import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apiFootballConfigured,
  apiFootballGet,
  fetchApiFootballFixturesByDate,
  fetchApiFootballHeadToHead,
  getApiFootballScores,
  hasApiFootballKey,
  isApiFootballFixtureFinished,
  isApiFootballRateLimited,
  isApiFootballSeasonAccessible,
  isDateWithinApiFootballWindow,
  resetApiFootballRuntimeStateForTests,
} from '../src/services/serverFootballApis';
import {
  areCompetitionsCompatible,
  canonicalizeProviderCompetitionName,
} from '../src/services/serverFootballProviderEnrichment';

function snapshotApiFootballEnv() {
  return {
    directKey: process.env.API_FOOTBALL_KEY,
    shortKey: process.env.API_FOOTBALL,
    altKey: process.env.API_FOOTBALL_API_KEY,
    apiSportsKey: process.env.APISPORTS_KEY,
    rapidKey: process.env.API_FOOTBALL_USE_RAPIDAPI,
    rapidHost: process.env.API_FOOTBALL_RAPIDAPI_HOST,
    baseUrl: process.env.API_FOOTBALL_BASE_URL,
  };
}

function clearApiFootballEnv() {
  delete process.env.API_FOOTBALL_KEY;
  delete process.env.API_FOOTBALL;
  delete process.env.API_FOOTBALL_API_KEY;
  delete process.env.APISPORTS_KEY;
  delete process.env.API_FOOTBALL_USE_RAPIDAPI;
  delete process.env.API_FOOTBALL_RAPIDAPI_HOST;
  delete process.env.API_FOOTBALL_BASE_URL;
}

function restoreApiFootballEnv(snapshot: ReturnType<typeof snapshotApiFootballEnv>) {
  const entries: Array<[string, string | undefined]> = [
    ['API_FOOTBALL_KEY', snapshot.directKey],
    ['API_FOOTBALL', snapshot.shortKey],
    ['API_FOOTBALL_API_KEY', snapshot.altKey],
    ['APISPORTS_KEY', snapshot.apiSportsKey],
    ['API_FOOTBALL_USE_RAPIDAPI', snapshot.rapidKey],
    ['API_FOOTBALL_RAPIDAPI_HOST', snapshot.rapidHost],
    ['API_FOOTBALL_BASE_URL', snapshot.baseUrl],
  ];
  for (const [k, v] of entries) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

test('direct API-Football key (API_FOOTBALL_KEY or API_FOOTBALL) uses v3.football.api-sports.io directly', async () => {
  const originalFetch = globalThis.fetch;
  const snap = snapshotApiFootballEnv();
  resetApiFootballRuntimeStateForTests();
  clearApiFootballEnv();

  let requestUrl: URL | undefined;
  let requestHeaders: HeadersInit | undefined;

  process.env.API_FOOTBALL = 'direct-secret-from-api-football-var';
  process.env.API_FOOTBALL_USE_RAPIDAPI = 'true'; // boolean flag should never be treated as a key
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    requestUrl = new URL(String(input));
    requestHeaders = init?.headers;
    return new Response(JSON.stringify({ errors: [], response: [] }), { status: 200 });
  }) as typeof fetch;

  try {
    assert.equal(hasApiFootballKey(), true);
    assert.equal(apiFootballConfigured(), true);
    await apiFootballGet('fixtures', { date: '2026-10-29' });
    assert.equal(requestUrl?.origin, 'https://v3.football.api-sports.io');
    assert.equal(new Headers(requestHeaders).get('x-apisports-key'), 'direct-secret-from-api-football-var');
    assert.equal(new Headers(requestHeaders).get('x-rapidapi-key'), null);
  } finally {
    globalThis.fetch = originalFetch;
    restoreApiFootballEnv(snap);
    resetApiFootballRuntimeStateForTests();
  }
});

test('direct API-SPORTS credential mounted in legacy API_FOOTBALL_USE_RAPIDAPI auto-switches on RapidAPI 403', async () => {
  const originalFetch = globalThis.fetch;
  const snap = snapshotApiFootballEnv();
  resetApiFootballRuntimeStateForTests();
  clearApiFootballEnv();

  const calls: Array<{ origin: string; apiSportsKey: string | null; rapidKey: string | null }> = [];
  process.env.API_FOOTBALL_USE_RAPIDAPI = 'direct-key-in-legacy-var';

  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const u = new URL(String(input));
    const h = new Headers(init?.headers);
    calls.push({
      origin: u.origin,
      apiSportsKey: h.get('x-apisports-key'),
      rapidKey: h.get('x-rapidapi-key'),
    });
    if (u.origin.includes('rapidapi.com')) {
      return new Response(JSON.stringify({ message: 'You are not subscribed to this API.' }), { status: 403 });
    }
    return new Response(JSON.stringify({ errors: [], response: [{ fixture: { id: 1001 } }] }), { status: 200 });
  }) as typeof fetch;

  try {
    const first = await apiFootballGet('fixtures', { date: '2026-10-28' });
    assert.equal(first.response.length, 1);
    assert.equal(apiFootballConfigured(), true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].origin, 'https://api-football-v1.p.rapidapi.com');
    assert.equal(calls[1].origin, 'https://v3.football.api-sports.io');
    assert.equal(calls[1].apiSportsKey, 'direct-key-in-legacy-var');

    await apiFootballGet('fixtures', { date: '2026-10-29' });
    assert.equal(calls.length, 3);
    assert.equal(calls[2].origin, 'https://v3.football.api-sports.io');
  } finally {
    globalThis.fetch = originalFetch;
    restoreApiFootballEnv(snap);
    resetApiFootballRuntimeStateForTests();
  }
});

test('handles Free-plan date window, season restriction, quota errors, and H2H without last parameter', async () => {
  const originalFetch = globalThis.fetch;
  const snap = snapshotApiFootballEnv();
  resetApiFootballRuntimeStateForTests();
  clearApiFootballEnv();
  process.env.API_FOOTBALL = 'free-plan-direct-key';

  const requestedUrls: string[] = [];
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    requestedUrls.push(url.pathname + url.search);

    if (url.pathname.endsWith('/fixtures') && url.searchParams.get('date') === '2026-10-26') {
      return new Response(JSON.stringify({
        errors: { plan: 'Free plans do not have access to this date, try from 2026-10-28 to 2026-10-30.' },
        response: [],
      }), { status: 200 });
    }

    if (url.pathname.endsWith('/fixtures/headtohead')) {
      assert.equal(url.searchParams.has('last'), false, 'Free plan rejects last parameter on headtohead');
      return new Response(JSON.stringify({
        errors: [],
        response: [
          { fixture: { id: 1, date: '2020-01-01T15:00:00Z', status: { short: 'FT' } }, goals: { home: 0, away: 0 } },
          { fixture: { id: 2, date: '2026-11-15T15:00:00Z', status: { short: 'NS' } }, goals: { home: null, away: null } },
          { fixture: { id: 3, date: '2026-04-01T15:00:00Z', status: { short: 'FT' } }, goals: { home: 2, away: 1 } },
          { fixture: { id: 4, date: '2025-11-01T15:00:00Z', status: { short: 'FT' } }, goals: { home: 1, away: 1 } },
          { fixture: { id: 5, date: '2025-03-01T15:00:00Z', status: { short: 'FT' } }, goals: { home: 0, away: 2 } },
          { fixture: { id: 6, date: '2024-10-01T15:00:00Z', status: { short: 'FT' } }, goals: { home: 3, away: 1 } },
          { fixture: { id: 7, date: '2024-02-01T15:00:00Z', status: { short: 'FT' } }, goals: { home: 1, away: 0 } },
        ],
      }), { status: 200 });
    }

    if (url.pathname.endsWith('/standings')) {
      return new Response(JSON.stringify({
        errors: { plan: 'Free plans do not have access to this season, try from 2022 to 2024.' },
        response: [],
      }), { status: 200 });
    }

    if (url.pathname.endsWith('/quota-test')) {
      return new Response(JSON.stringify({
        errors: { requests: 'You have reached the request limit for the day.' },
        response: [],
      }), { status: 200 });
    }

    return new Response(JSON.stringify({ errors: [], response: [] }), { status: 200 });
  }) as typeof fetch;

  try {
    // 1. Out-of-window date learns [2026-10-28..2026-10-30] and skips subsequent out-of-window calls
    const out1 = await fetchApiFootballFixturesByDate('2026-10-26');
    assert.deepEqual(out1, []);
    assert.equal(isDateWithinApiFootballWindow('2026-10-27'), false);
    assert.equal(isDateWithinApiFootballWindow('2026-10-29'), true);
    const beforeSkip = requestedUrls.length;
    const out2 = await fetchApiFootballFixturesByDate('2026-10-25');
    assert.deepEqual(out2, []);
    assert.equal(requestedUrls.length, beforeSkip, 'cached date window must prevent extra HTTP requests');

    // 2. H2H omits `last`, skips unplayed NS fixtures, and returns the 5 most recent meetings
    const h2h = await fetchApiFootballHeadToHead(42, 40);
    assert.deepEqual(h2h.map((m) => m.fixture.id), [3, 4, 5, 6, 7]);

    // 3. Season restriction marks season 2026 inaccessible without pausing the whole provider
    await assert.rejects(apiFootballGet('standings', { league: 39, season: 2026 }), /plan restriction/i);
    assert.equal(isApiFootballSeasonAccessible(2026), false);
    assert.equal(apiFootballConfigured(), true);

    // 4. Settlement score helpers
    assert.equal(isApiFootballFixtureFinished({ fixture: { status: { short: 'FT' } } }), true);
    assert.equal(isApiFootballFixtureFinished({ fixture: { status: { short: 'NS' } } }), false);
    assert.deepEqual(
      getApiFootballScores({ fixture: { status: { short: 'FT' } }, score: { fulltime: { home: 2, away: 1 } } }),
      { home: 2, away: 1, outcome: 'home' },
    );

    // 5. Hyphenated API-Football country labels resolve Premiership unambiguously
    assert.equal(canonicalizeProviderCompetitionName('South-Africa • Premiership'), 'south african premiership');
    assert.equal(canonicalizeProviderCompetitionName('Scotland • Premiership'), 'scottish premiership');
    assert.equal(canonicalizeProviderCompetitionName('Premiership'), 'premiership');
    assert.equal(areCompetitionsCompatible('South African Premiership', undefined, 'Premiership', 'South-Africa'), true);
    assert.equal(areCompetitionsCompatible('Scottish Premiership', undefined, 'Premiership', 'Scotland'), true);
    assert.equal(areCompetitionsCompatible('Scottish Premiership', undefined, 'Premiership', 'South-Africa'), false);

    // 6. HTTP 200 daily quota error activates rate-limit cooldown
    await assert.rejects(apiFootballGet('quota-test'), /rate limited/i);
    assert.equal(isApiFootballRateLimited(), true);
  } finally {
    globalThis.fetch = originalFetch;
    restoreApiFootballEnv(snap);
    resetApiFootballRuntimeStateForTests();
  }
});

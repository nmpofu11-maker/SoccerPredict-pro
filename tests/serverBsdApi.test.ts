import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bsdConfigured,
  fetchBsdCoverage,
  fetchBsdEventsByDate,
  fetchBsdEventDetail,
  fetchBsdEventAvailability,
  fetchBsdEventStats,
  fetchBsdEventLineups,
  fetchBsdEventPrediction,
  fetchBsdLeagueStandings,
  fetchBsdTeamForm,
} from '../src/services/serverBsdApi';

const originalFetch = globalThis.fetch;
const originalEnv = {
  bsdKey: process.env.BSD_API_KEY,
  bsdBase: process.env.BSD_BASE_URL,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEnv.bsdKey === undefined) delete process.env.BSD_API_KEY;
  else process.env.BSD_API_KEY = originalEnv.bsdKey;
  if (originalEnv.bsdBase === undefined) delete process.env.BSD_BASE_URL;
  else process.env.BSD_BASE_URL = originalEnv.bsdBase;
});

describe('server BSD (Bzzoiro Sports Data) provider client - Stage A', () => {
  it('reports configured state from Cloud Run secret-backed environment variables', () => {
    delete process.env.BSD_API_KEY;
    assert.equal(bsdConfigured(), false);
    process.env.BSD_API_KEY = 'bsd-secret-token-123';
    assert.equal(bsdConfigured(), true);
  });

  it('rejects authenticated calls when BSD_API_KEY is not configured', async () => {
    delete process.env.BSD_API_KEY;
    await assert.rejects(fetchBsdEventsByDate('2026-10-15'), /BSD_API_KEY is not configured/);
  });

  it('fetches real-time coverage from unauthenticated /coverage/ endpoint without token', async () => {
    delete process.env.BSD_API_KEY;
    let capturedHeaders: any;
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      assert.match(String(input), /\/api\/v2\/coverage\//);
      capturedHeaders = init?.headers;
      return new Response(
        JSON.stringify({
          generated_at: '2026-10-03T18:00:00Z',
          sports: [
            {
              sport: 'football',
              name: 'Football',
              status: 'in_season',
              events_next_7d: 397,
              events_next_30d: 2206,
              events_last_7d: 523,
              priced_next_7d: 185,
              live_now: 2,
              next_event_at: '2026-10-03T18:45:00Z',
              last_event_at: '2026-10-03T18:00:00Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;

    const coverage = await fetchBsdCoverage();
    assert.equal(coverage.sports[0].sport, 'football');
    assert.equal(coverage.sports[0].events_next_7d, 397);
    assert.equal(capturedHeaders?.['Authorization'], undefined);
  });

  it('uses Token auth header and fetches events by date', async () => {
    process.env.BSD_API_KEY = 'valid-token-abc';
    process.env.BSD_BASE_URL = 'https://sports.bzzoiro.com/api/v2';
    let capturedUrl = '';
    let capturedHeaders: any;

    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = init?.headers;
      return new Response(
        JSON.stringify({
          results: [
            {
              id: 98124,
              date: '2026-10-15',
              kickoff_time: '15:00:00',
              league: { id: 17, name: 'Premier League', country: 'England' },
              home_team: { id: 42, name: 'Arsenal', short_name: 'ARS' },
              away_team: { id: 65, name: 'Chelsea', short_name: 'CHE' },
              status: 'scheduled',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;

    const events = await fetchBsdEventsByDate('2026-10-15');
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 98124);
    assert.equal(events[0].home_team.name, 'Arsenal');
    assert.match(capturedUrl, /\/events\/\?date=2026-10-15/);
    assert.equal(capturedHeaders?.['Authorization'], 'Token valid-token-abc');
  });

  it('parses pagination envelopes (data array, root array, results array)', async () => {
    process.env.BSD_API_KEY = 'valid-token';
    // Test data envelope
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({ data: [{ id: 101, date: '2026-10-15', league: { id: 1 }, home_team: { id: 2 }, away_team: { id: 3 } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;
    const eventsData = await fetchBsdEventsByDate('2026-10-15');
    assert.equal(eventsData.length, 1);
    assert.equal(eventsData[0].id, 101);

    // Test root array
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify([{ id: 102, date: '2026-10-15', league: { id: 1 }, home_team: { id: 2 }, away_team: { id: 3 } }]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;
    const eventsRoot = await fetchBsdEventsByDate('2026-10-15');
    assert.equal(eventsRoot.length, 1);
    assert.equal(eventsRoot[0].id, 102);
  });

  it('rejects invalid date formats before network request', async () => {
    process.env.BSD_API_KEY = 'test-token';
    await assert.rejects(fetchBsdEventsByDate('15-10-2026'), /YYYY-MM-DD/);
  });

  it('fetches event availability correctly', async () => {
    process.env.BSD_API_KEY = 'test-token';
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      assert.match(String(input), /\/events\/98124\/availability\//);
      return new Response(
        JSON.stringify({ stats: true, lineups: true, shotmap: true, odds: true, prediction: true }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;

    const avail = await fetchBsdEventAvailability(98124);
    assert.equal(avail.stats, true);
    assert.equal(avail.shotmap, true);
    assert.equal(avail.prediction, true);
  });

  it('fetches match stats and shot-level xG correctly', async () => {
    process.env.BSD_API_KEY = 'test-token';
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      assert.match(String(input), /\/events\/98124\/stats\//);
      return new Response(
        JSON.stringify({
          match_id: 98124,
          possession: { home: 58, away: 42 },
          shots_total: { home: 14, away: 8 },
          shots_on_target: { home: 6, away: 3 },
          xg: { home: 1.85, away: 0.72 },
          shots: [
            { id: 1, minute: 14, team_id: 42, xg: 0.35, x: 88.5, y: 49.2, outcome: 'goal', situation: 'open_play', body_part: 'right_foot' },
            { id: 2, minute: 28, team_id: 65, xg: 0.12, x: 74.0, y: 35.0, outcome: 'saved', situation: 'open_play', body_part: 'left_foot' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;

    const stats = await fetchBsdEventStats(98124);
    assert.ok(stats);
    assert.equal(stats.possession?.home, 58);
    assert.equal(stats.xg?.home, 1.85);
    assert.equal(stats.shots?.length, 2);
    assert.equal(stats.shots?.[0].xg, 0.35);
  });

  it('fetches Dixon-Coles analytic predictions correctly', async () => {
    process.env.BSD_API_KEY = 'test-token';
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      assert.match(String(input), /\/events\/98124\/prediction\//);
      return new Response(
        JSON.stringify({
          event_id: 98124,
          model: 'dixon-coles-analytic-blend',
          markets: {
            full_time_result: { home: 0.54, draw: 0.26, away: 0.20 },
            over_under_25: { over: 0.58, under: 0.42 },
            btts: { yes: 0.52, no: 0.48 },
          },
          expected_goals: { home: 1.74, away: 1.05, total: 2.79 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;

    const pred = await fetchBsdEventPrediction(98124);
    assert.ok(pred);
    assert.equal(pred.model, 'dixon-coles-analytic-blend');
    assert.equal(pred.markets.full_time_result?.home, 0.54);
    assert.equal(pred.expected_goals?.total, 2.79);
  });

  it('fetches league standings correctly', async () => {
    process.env.BSD_API_KEY = 'test-token';
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      assert.match(String(input), /\/leagues\/17\/standings\//);
      return new Response(
        JSON.stringify({
          league_id: 17,
          season: '26/27',
          entries: [
            { rank: 1, team_id: 42, team_name: 'Arsenal', played: 7, won: 6, drawn: 1, lost: 0, goals_for: 17, goals_against: 4, goal_difference: 13, points: 19 },
            { rank: 2, team_id: 88, team_name: 'Manchester City', played: 7, won: 5, drawn: 2, lost: 0, goals_for: 16, goals_against: 5, goal_difference: 11, points: 17 },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;

    const standings = await fetchBsdLeagueStandings(17);
    assert.ok(standings);
    assert.equal(standings.entries.length, 2);
    assert.equal(standings.entries[0].team_name, 'Arsenal');
    assert.equal(standings.entries[0].rank, 1);
    assert.equal(standings.entries[0].points, 19);
  });

  it('fetches team form metrics correctly', async () => {
    process.env.BSD_API_KEY = 'test-token';
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      assert.match(String(input), /\/teams\/42\/form\//);
      return new Response(
        JSON.stringify({
          team_id: 42,
          matches_count: 5,
          ppg: 2.6,
          wins: 4,
          draws: 1,
          losses: 0,
          goals_scored_avg: 2.2,
          goals_conceded_avg: 0.6,
          form_sequence: ['W', 'W', 'W', 'D', 'W'],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;

    const form = await fetchBsdTeamForm(42);
    assert.ok(form);
    assert.equal(form.ppg, 2.6);
    assert.deepEqual(form.form_sequence, ['W', 'W', 'W', 'D', 'W']);
  });

  it('handles API 401 unauthorized cleanly', async () => {
    process.env.BSD_API_KEY = 'invalid-token';
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({ error: true, status: 401, detail: 'Invalid token or account expired' }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;

    await assert.rejects(
      fetchBsdEventDetail(123),
      /BSD API error 401: Invalid token or account expired/
    );
  });

  it('handles API 403 forbidden cleanly', async () => {
    process.env.BSD_API_KEY = 'unauthorized-token';
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({ error: true, status: 403, detail: 'Endpoint requires paid sports addon' }),
        { status: 403, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;

    await assert.rejects(
      fetchBsdEventDetail(123),
      /BSD API error 403: Endpoint requires paid sports addon/
    );
  });

  it('handles API 429 rate limit cleanly', async () => {
    process.env.BSD_API_KEY = 'valid-token';
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({ error: true, status: 429, detail: 'Rate limit exceeded: 10 req/s' }),
        { status: 429, headers: { 'content-type': 'application/json' } }
      );
    }) as typeof fetch;

    await assert.rejects(
      fetchBsdEventDetail(123),
      /BSD API error 429: Rate limit exceeded/
    );
  });

  it('handles HTML error pages from Nginx/Cloudflare gracefully', async () => {
    process.env.BSD_API_KEY = 'valid-token';
    globalThis.fetch = (async () => {
      return new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      });
    }) as typeof fetch;

    await assert.rejects(
      fetchBsdEventDetail(123),
      /BSD API error 502/
    );
  });

  it('handles HTTP 500 Internal Server Error cleanly', async () => {
    process.env.BSD_API_KEY = 'valid-token';
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: true, status: 500, detail: 'Internal server error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    await assert.rejects(
      fetchBsdEventDetail(123),
      /BSD API error 500: Internal server error/
    );
  });

  it('handles network timeouts and abort errors cleanly', async () => {
    process.env.BSD_API_KEY = 'valid-token';
    globalThis.fetch = (async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    }) as typeof fetch;

    await assert.rejects(
      fetchBsdEventDetail(123),
      /aborted due to timeout/
    );
  });
});

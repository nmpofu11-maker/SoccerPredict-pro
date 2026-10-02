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

  it('uses Sportmonks api_token and parses fixture results', async () => {
    process.env.SPORTMONKS_API_KEY = 'monks-key';
    process.env.SPORTMONKS_BASE_URL = 'https://sportmonks.test/v3/football';
    let capturedUrl = '';
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      capturedUrl = String(input);
      return new Response(JSON.stringify({ data: [{ id: 456 }] }), { status: 200 });
    }) as typeof fetch;

    const fixtures = await fetchSportmonksFixturesByDate('2026-10-02');
    assert.equal(fixtures[0].id, 456);
    assert.match(capturedUrl, /api_token=monks-key/);
    assert.match(capturedUrl, /fixtures\/date\/2026-10-02/);
  });

  it('rejects invalid dates before making provider requests', async () => {
    process.env.API_FOOTBALL_USE_RAPIDAPI = 'rapid-key';
    await assert.rejects(fetchApiFootballFixturesByDate('02-10-2026'), /YYYY-MM-DD/);
  });
});

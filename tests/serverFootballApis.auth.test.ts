import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFootballGet } from '../src/services/serverFootballApis';

test('direct API-Football key takes precedence over legacy RapidAPI secret', async () => {
  const originalFetch = globalThis.fetch;
  const original = {
    directKey: process.env.API_FOOTBALL_KEY,
    rapidKey: process.env.API_FOOTBALL_USE_RAPIDAPI,
    rapidHost: process.env.API_FOOTBALL_RAPIDAPI_HOST,
    baseUrl: process.env.API_FOOTBALL_BASE_URL,
  };
  let requestUrl: URL | undefined;
  let requestHeaders: HeadersInit | undefined;

  process.env.API_FOOTBALL_KEY = 'direct-test-key';
  process.env.API_FOOTBALL_USE_RAPIDAPI = 'legacy-rapid-test-key';
  delete process.env.API_FOOTBALL_RAPIDAPI_HOST;
  delete process.env.API_FOOTBALL_BASE_URL;
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    requestUrl = new URL(String(input));
    requestHeaders = init?.headers;
    return new Response(JSON.stringify({ response: [] }), { status: 200 });
  }) as typeof fetch;

  try {
    await apiFootballGet('fixtures', { date: '2026-10-28' });
    assert.equal(requestUrl?.origin, 'https://v3.football.api-sports.io');
    assert.equal(new Headers(requestHeaders).get('x-apisports-key'), 'direct-test-key');
    assert.equal(new Headers(requestHeaders).get('x-rapidapi-key'), null);
  } finally {
    globalThis.fetch = originalFetch;
    if (original.directKey === undefined) delete process.env.API_FOOTBALL_KEY;
    else process.env.API_FOOTBALL_KEY = original.directKey;
    if (original.rapidKey === undefined) delete process.env.API_FOOTBALL_USE_RAPIDAPI;
    else process.env.API_FOOTBALL_USE_RAPIDAPI = original.rapidKey;
    if (original.rapidHost === undefined) delete process.env.API_FOOTBALL_RAPIDAPI_HOST;
    else process.env.API_FOOTBALL_RAPIDAPI_HOST = original.rapidHost;
    if (original.baseUrl === undefined) delete process.env.API_FOOTBALL_BASE_URL;
    else process.env.API_FOOTBALL_BASE_URL = original.baseUrl;
  }
});

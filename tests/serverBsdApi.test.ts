import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bsdConfigured,
  bsdGet,
  clearBsdCache,
  fetchBsdCoverage,
  fetchBsdEventResource,
  withBsdIds,
  BsdApiError,
} from '../src/services/serverBsdApi';

const originalFetch = globalThis.fetch;
const originalKey = process.env.BSD_API_KEY;
const originalBase = process.env.BSD_API_BASE_URL;

test('BSD client requires a server-side key and reports disabled state', async () => {
  delete process.env.BSD_API_KEY;
  assert.equal(bsdConfigured(), false);
  await assert.rejects(() => bsdGet('coverage/'), (error: unknown) =>
    error instanceof BsdApiError && error.status === 503);
  if (originalKey !== undefined) process.env.BSD_API_KEY = originalKey;
});

test('BSD sends Token auth and records source provenance', async () => {
  process.env.BSD_API_KEY = 'test-secret';
  process.env.BSD_API_BASE_URL = 'https://bsd.test/api/v2';
  clearBsdCache();
  let seenAuthorization = '';
  globalThis.fetch = (async (_input: any, init?: RequestInit) => {
    seenAuthorization = new Headers(init?.headers).get('authorization') || '';
    return new Response(JSON.stringify({ data: { competitions: [] } }), {
      status: 200, headers: { 'content-type': 'application/json', 'ratelimit-remaining': '99' },
    });
  }) as typeof fetch;
  const result = await fetchBsdCoverage({ forceRefresh: true });
  assert.equal(seenAuthorization, 'Token test-secret');
  assert.equal(result.source, 'BSD');
  assert.equal(result.cacheHit, false);
  assert.deepEqual(result.data, { competitions: [] });
  assert.equal(result.rateLimit.remaining, '99');
});

test('BSD resource paths remain provider-specific and cached per endpoint', async () => {
  process.env.BSD_API_KEY = 'test-secret';
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ data: { shots: [] } }), { status: 200 });
  }) as typeof fetch;
  clearBsdCache();
  const first = await fetchBsdEventResource('bsd-123', 'shotmap');
  const second = await fetchBsdEventResource('bsd-123', 'shotmap');
  assert.equal(first.endpoint, 'events/bsd-123/shotmap/');
  assert.equal(second.cacheHit, true);
  assert.equal(calls, 1);
});

test('BSD IDs are stored only in bsd-prefixed fields', () => {
  const fixture = withBsdIds(
    { sportApiAiFixtureId: 'sportapi-1', sportmonksFixtureId: 'sportmonks-2' },
    { fixtureId: 42, homeTeamId: 10, awayTeamId: 11 },
  );
  assert.equal(fixture.bsdFixtureId, '42');
  assert.equal(fixture.bsdHomeTeamId, '10');
  assert.equal(fixture.bsdAwayTeamId, '11');
  assert.equal(fixture.sportApiAiFixtureId, 'sportapi-1');
  assert.equal(fixture.sportmonksFixtureId, 'sportmonks-2');
});

test('BSD HTTP errors preserve status and never fabricate data', async () => {
  process.env.BSD_API_KEY = 'test-secret';
  globalThis.fetch = (async () => new Response(JSON.stringify({ detail: 'unauthorized' }), { status: 401 })) as typeof fetch;
  await assert.rejects(() => bsdGet('leagues/', { forceRefresh: true }), (error: unknown) =>
    error instanceof BsdApiError && error.status === 401);
});

test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.BSD_API_KEY;
  else process.env.BSD_API_KEY = originalKey;
  if (originalBase === undefined) delete process.env.BSD_API_BASE_URL;
  else process.env.BSD_API_BASE_URL = originalBase;
  clearBsdCache();
});

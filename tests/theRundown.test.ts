import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllTheRundownSoccerEvents, THE_RUNDOWN_SOCCER_SPORTS, isTheRundownEventFinished, getTheRundownScores } from '../src/services/serverTheRundown';

type FetchFn = typeof globalThis.fetch;
const realFetch = globalThis.fetch;
const realWarn = console.warn;

function setup(handler: (url: string, call: number) => { status: number; body?: unknown }) {
  process.env.THERUNDOWN_KEY = 'test-key';
  process.env.THERUNDOWN_REQUEST_SPACING_MS = '0';
  const calls: string[] = [];
  const warnings: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    if (url.endsWith('/sports')) {
      return new Response(JSON.stringify(THE_RUNDOWN_SOCCER_SPORTS), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const r = handler(url, calls.length);
    calls.push(url);
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {});
    return new Response(text, { status: r.status, headers: { 'content-type': 'application/json' } });
  }) as FetchFn;
  console.warn = (...a: unknown[]) => { warnings.push(a.map(String).join(' ')); };
  return { calls, warnings };
}
function teardown() {
  globalThis.fetch = realFetch;
  console.warn = realWarn;
  delete process.env.THERUNDOWN_REQUEST_SPACING_MS;
}
const event = (id: string) => ({ events: [{ event_id: id }] });

test('HTTP 429 retries once, then stops the batch and logs exactly one warning', async () => {
  const { calls, warnings } = setup(() => ({ status: 429, body: 'slow down' }));
  try {
    const res = await fetchAllTheRundownSoccerEvents('2026-10-01');
    assert.deepEqual(res, []);
    assert.equal(calls.length, 2, 'one attempt plus one retry, then the loop stops');
    const rl = warnings.filter((w) => /Rate limit reached/.test(w));
    assert.equal(rl.length, 1);
    assert.match(rl[0], new RegExp(`skipping ${THE_RUNDOWN_SOCCER_SPORTS.length} league`));
  } finally { teardown(); }
});

test('a single league failing with HTTP 500 does not stop the other leagues', async () => {
  const { calls, warnings } = setup((_url, call) =>
    call === 0 ? { status: 500, body: 'boom' } : { status: 200, body: event(`e${call}`) });
  try {
    const res = await fetchAllTheRundownSoccerEvents('2026-10-01');
    assert.equal(calls.length, THE_RUNDOWN_SOCCER_SPORTS.length);
    assert.equal(res.length, THE_RUNDOWN_SOCCER_SPORTS.length - 1);
    assert.equal(warnings.filter((w) => /Failed fetching/.test(w)).length, 1);
  } finally { teardown(); }
});

test('an error body that merely contains "429" is not treated as rate limiting', async () => {
  const { calls } = setup((_url, call) =>
    call === 0 ? { status: 500, body: 'upstream id 429 not found' } : { status: 200, body: event(`e${call}`) });
  try {
    const res = await fetchAllTheRundownSoccerEvents('2026-10-01');
    assert.equal(calls.length, THE_RUNDOWN_SOCCER_SPORTS.length, 'loop must continue past a non-429 failure');
    assert.equal(res.length, THE_RUNDOWN_SOCCER_SPORTS.length - 1);
  } finally { teardown(); }
});

test('a 429 that clears on the retry is recovered without skipping leagues', async () => {
  const { calls } = setup((_url, call) =>
    call === 0 ? { status: 429 } : { status: 200, body: event(`e${call}`) });
  try {
    const res = await fetchAllTheRundownSoccerEvents('2026-10-01');
    assert.equal(res.length, THE_RUNDOWN_SOCCER_SPORTS.length);
    assert.equal(calls.length, THE_RUNDOWN_SOCCER_SPORTS.length + 1);
  } finally { teardown(); }
});


test('finished-status helper accepts explicit full-time and final statuses', () => {
  for (const status of [
    'STATUS_FULL_TIME', 'FULL_TIME', 'FULL TIME', 'FT',
    'STATUS_FINAL', 'FINAL', 'STATUS_FINAL_PEN', 'AET', 'PEN',
  ]) {
    assert.equal(
      isTheRundownEventFinished({
        event_id: 'test',
        score: { event_status: status, score_home: 2, score_away: 1 },
      } as any),
      true,
      status
    );
  }
});

test('finished-status helper rejects scheduled, live, postponed, and missing statuses', () => {
  for (const status of [
    'STATUS_SCHEDULED', 'STATUS_IN_PROGRESS', 'STATUS_POSTPONED', '',
  ]) {
    assert.equal(
      isTheRundownEventFinished({
        event_id: 'test',
        score: { event_status: status, score_home: 2, score_away: 1 },
      } as any),
      false,
      status
    );
  }
  assert.equal(isTheRundownEventFinished({ event_id: 'test' } as any), false);
});

test('TheRundown score helper returns an outcome only when both scores are numeric', () => {
  const result = getTheRundownScores({
    event_id: 'test',
    score: { event_status: 'STATUS_FULL_TIME', score_home: 2, score_away: 1 },
  } as any);
  assert.deepEqual(result, { home: 2, away: 1, outcome: 'home' });

  const missing = getTheRundownScores({
    event_id: 'test',
    score: { event_status: 'STATUS_FULL_TIME', score_home: null, score_away: 1 },
  } as any);
  assert.deepEqual(missing, { home: null, away: null, outcome: null });

  for (const invalidScore of [-1, 1.5]) {
    const invalid = getTheRundownScores({
      event_id: 'test',
      score: { event_status: 'STATUS_FULL_TIME', score_home: invalidScore, score_away: 1 },
    } as any);
    assert.deepEqual(invalid, { home: null, away: null, outcome: null });
  }
});

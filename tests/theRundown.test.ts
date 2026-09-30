import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllTheRundownSoccerEvents, THE_RUNDOWN_SOCCER_SPORTS } from '../src/services/serverTheRundown';

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

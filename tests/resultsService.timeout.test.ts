import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fetchDailySlate, fetchPersistedSlate, triggerIngestNow } from '../src/services/resultsService';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('triggerIngestNow reports a provider-ingestion timeout instead of spinning forever', async () => {
  globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    return await new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error('Expected the ingestion request to have an abort signal'));
        return;
      }
      if (signal.aborted) {
        reject(new DOMException('Request aborted', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', () => {
        reject(new DOMException('Request aborted', 'AbortError'));
      }, { once: true });
    });
  }) as typeof fetch;

  const result = await triggerIngestNow(5);
  assert.equal(result.success, false);
  assert.match(result.message, /timed out after 0\.005 seconds/i);
});

test('fetchDailySlate aborts a stalled request and returns null', async () => {
  globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    return await new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error('Expected the request to have an abort signal'));
        return;
      }
      if (signal.aborted) {
        reject(new DOMException('Request aborted', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', () => {
        reject(new DOMException('Request aborted', 'AbortError'));
      }, { once: true });
    });
  }) as typeof fetch;

  assert.equal(await fetchDailySlate(5), null);
});

test('fetchPersistedSlate reads the stored manifest without calling the expensive refresh endpoint', async () => {
  let requestedUrl = '';
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({
      status: 'success',
      count: 0,
      syncedAt: '2026-10-23T00:00:00.000Z',
      fixtures: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const result = await fetchPersistedSlate(1_000);
  assert.equal(requestedUrl, '/api/fixtures/persisted');
  assert.deepEqual(result.fixtures, []);
  assert.equal(result.message, null);
});

test('fetchPersistedSlate preserves actionable server error messages', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    status: 'error',
    message: 'manifest unreadable',
  }), {
    status: 500,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch;

  const result = await fetchPersistedSlate(1_000);
  assert.equal(result.fixtures, null);
  assert.equal(result.message, 'manifest unreadable');
});

test('fetchDailySlate accepts a valid server fixture response', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    status: 'success',
    count: 0,
    syncedAt: '2026-10-23T00:00:00.000Z',
    fixtures: [],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch;

  assert.deepEqual(await fetchDailySlate(1_000), []);
});

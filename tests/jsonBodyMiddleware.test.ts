import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  DEFAULT_JSON_BODY_LIMIT,
  registerJsonBodyParsers,
  resolveJsonBodyLimit,
} from '../src/utils/jsonBodyMiddleware';

async function withTestServer(
  limit: string | number | undefined,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  registerJsonBodyParsers(app, limit);

  app.post('/api/fixtures/verify', (req, res) => {
    const fixtures = Array.isArray(req.body?.fixtures) ? req.body.fixtures : [];
    res.json({ status: 'success', count: fixtures.length });
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

describe('jsonBodyMiddleware', () => {
  it('defaults to 15mb and honors JSON_BODY_LIMIT override', () => {
    assert.equal(resolveJsonBodyLimit({}), DEFAULT_JSON_BODY_LIMIT);
    assert.equal(resolveJsonBodyLimit({ JSON_BODY_LIMIT: '  ' }), DEFAULT_JSON_BODY_LIMIT);
    assert.equal(resolveJsonBodyLimit({ JSON_BODY_LIMIT: '25mb' }), '25mb');
  });

  it('accepts multi-hundred-kilobyte fixture JSON payloads above Express default 100kb', async () => {
    const fixtures = Array.from({ length: 300 }, (_, idx) => ({
      id: `fixture_${idx}`,
      kickoffTime: '2026-10-30T19:00:00Z',
      league: 'English Premier League',
      venue: `Stadium ${idx} (${'x'.repeat(900)})`,
      homeTeam: { id: `home_${idx}`, name: `Home Team ${idx}` },
      awayTeam: { id: `away_${idx}`, name: `Away Team ${idx}` },
    }));

    const serialized = JSON.stringify({ fixtures });
    assert.ok(Buffer.byteLength(serialized, 'utf8') > 300 * 1024);

    await withTestServer(undefined, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/fixtures/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serialized,
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body, { status: 'success', count: 300 });
    });
  });

  it('returns structured 413 JSON without dumping PayloadTooLargeError when body exceeds limit', async () => {
    await withTestServer('4kb', async (baseUrl) => {
      const oversized = JSON.stringify({
        fixtures: [{ id: 'big', notes: 'y'.repeat(10_000) }],
      });

      const res = await fetch(`${baseUrl}/api/fixtures/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: oversized,
      });

      assert.equal(res.status, 413);
      const body = await res.json();
      assert.equal(body.status, 'error');
      assert.equal(body.error, 'Payload too large');
      assert.match(body.message, /4kb/);
    });
  });

  it('returns structured 400 JSON when request body has malformed JSON', async () => {
    await withTestServer(undefined, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/fixtures/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"fixtures": [',
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.status, 'error');
      assert.equal(body.error, 'Invalid JSON payload');
    });
  });
});

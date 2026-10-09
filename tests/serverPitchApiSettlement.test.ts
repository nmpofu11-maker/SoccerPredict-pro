import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPitchApiFinishedMatchesByDate, pitchApiConfigured } from '../src/services/serverPitchApi';

test('serverPitchApi: pitchApiConfigured reflects presence of api key', () => {
  const origKey = process.env.PITCHAPI_API_KEY;
  try {
    process.env.PITCHAPI_API_KEY = 'test_key';
    assert.equal(pitchApiConfigured(), true);
    process.env.PITCHAPI_API_KEY = '';
    delete process.env.PITCH_KEY;
    assert.equal(pitchApiConfigured(), false);
  } finally {
    process.env.PITCHAPI_API_KEY = origKey;
  }
});

test('serverPitchApi: rejects invalid date formats', async () => {
  const origKey = process.env.PITCHAPI_API_KEY;
  try {
    process.env.PITCHAPI_API_KEY = 'test_key';
    await assert.rejects(
      async () => {
        await fetchPitchApiFinishedMatchesByDate('invalid-date');
      },
      { message: /PitchAPI date must be YYYY-MM-DD/ }
    );
  } finally {
    process.env.PITCHAPI_API_KEY = origKey;
  }
});

test('serverPitchApi: throws error when API key is missing', async () => {
  const origKey = process.env.PITCHAPI_API_KEY;
  const origPitchKey = process.env.PITCH_KEY;
  try {
    delete process.env.PITCHAPI_API_KEY;
    delete process.env.PITCH_KEY;
    await assert.rejects(
      async () => {
        await fetchPitchApiFinishedMatchesByDate('2026-10-08');
      },
      { message: /PITCHAPI_API_KEY is not configured/ }
    );
  } finally {
    process.env.PITCHAPI_API_KEY = origKey;
    if (origPitchKey) process.env.PITCH_KEY = origPitchKey;
  }
});

test('serverPitchApi: finished matches query and schema validation against mock responses', async () => {
  const origFetch = globalThis.fetch;
  const origKey = process.env.PITCHAPI_API_KEY;
  try {
    process.env.PITCHAPI_API_KEY = 'test_key';
    let requestedUrl = '';
    let requestedHeaders: any = {};

    globalThis.fetch = (async (url: any, options: any) => {
      requestedUrl = String(url);
      requestedHeaders = options?.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            date: '2026-10-08',
            matches: [
              {
                id: 'm_test_1',
                status: 'finished',
                score_home: 2,
                score_away: 1,
                home_team: { id: 't_home', name: 'Shamrock Rovers' },
                away_team: { id: 't_away', name: 'Drogheda United' },
                time_utc: '2026-10-08T19:00:00Z',
              },
              {
                id: 'm_test_2',
                status: 'upcoming',
                score_home: null,
                score_away: null,
                home_team: { id: 't_kups', name: 'KuPS' },
                away_team: { id: 't_oulu', name: 'Oulu' },
                time_utc: '2026-10-08T16:00:00Z',
              },
            ],
          },
        }),
      } as any;
    }) as any;

    const matches = await fetchPitchApiFinishedMatchesByDate('2026-10-08');
    assert.equal(requestedUrl.includes('/v1/date/2026-10-08?status=played'), true);
    assert.equal(requestedHeaders['X-API-KEY'], 'test_key');
    assert.equal(matches.length, 2);

    // Verify status filtering and score verification logic
    const finishedValid = matches.filter(
      (m) => m.status === 'finished' && Number.isFinite(m.score_home) && Number.isFinite(m.score_away)
    );
    assert.equal(finishedValid.length, 1);
    assert.equal(finishedValid[0].id, 'm_test_1');
    assert.equal(finishedValid[0].score_home, 2);
    assert.equal(finishedValid[0].score_away, 1);
  } finally {
    globalThis.fetch = origFetch;
    process.env.PITCHAPI_API_KEY = origKey;
  }
});

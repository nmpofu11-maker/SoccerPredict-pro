const BASE_URL = 'https://api.pitchapi.dev';

function getApiKey(): string {
  return process.env.PITCHAPI_API_KEY?.trim() || process.env.PITCH_KEY?.trim() || '';
}

export function pitchApiConfigured(): boolean {
  return getApiKey().length > 0;
}

export async function fetchPitchApiFixturesByDate(date: string): Promise<any[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('PITCHAPI_API_KEY is not configured');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('PitchAPI date must be YYYY-MM-DD');

  const url = BASE_URL + '/v1/date/' + encodeURIComponent(date) + '?status=upcoming';
  const res = await fetch(url, {
    headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => null) as any;

  if (!res.ok) {
    const code = body?.error?.code ? ' [' + body.error.code + ']' : '';
    const message = typeof body?.error?.message === 'string' ? body.error.message : 'HTTP ' + res.status;
    throw new Error('PitchAPI ' + res.status + code + ': ' + message);
  }

  const matches = body?.data?.matches;
  if (!Array.isArray(matches)) {
    throw new Error('PitchAPI returned an unexpected response shape: data.matches is not an array');
  }
  return matches;
}

export async function fetchPitchApiFinishedMatchesByDate(date: string): Promise<any[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('PITCHAPI_API_KEY is not configured');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('PitchAPI date must be YYYY-MM-DD');

  const url = BASE_URL + '/v1/date/' + encodeURIComponent(date) + '?status=played';
  const res = await fetch(url, {
    headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => null) as any;

  if (!res.ok) {
    const code = body?.error?.code ? ' [' + body.error.code + ']' : '';
    const message = typeof body?.error?.message === 'string' ? body.error.message : 'HTTP ' + res.status;
    throw new Error('PitchAPI ' + res.status + code + ': ' + message);
  }

  const matches = body?.data?.matches;
  if (!Array.isArray(matches)) {
    throw new Error('PitchAPI returned an unexpected response shape: data.matches is not an array');
  }
  return matches;
}

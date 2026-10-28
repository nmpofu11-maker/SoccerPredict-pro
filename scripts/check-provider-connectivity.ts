import 'dotenv/config';

type ProviderResult = {
  provider: string;
  configured: boolean;
  status: 'OK' | 'NOT_CONFIGURED' | 'AUTH_FAILED' | 'RATE_LIMITED' | 'DNS_OR_NETWORK_ERROR' | 'TIMEOUT' | 'HTTP_ERROR' | 'INVALID_RESPONSE';
  httpStatus?: number;
  fixtureCount?: number;
  message?: string;
};

const date = process.argv[2] || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('Usage: npm run providers:check -- [YYYY-MM-DD]');
  process.exit(2);
}

function classifyError(error: unknown): Pick<ProviderResult, 'status' | 'message'> {
  const err = error as any;
  const code = String(err?.cause?.code || err?.code || '');
  const message = String(err?.message || error || 'Unknown error').slice(0, 180);
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'ECONNRESET'].includes(code)) {
    return { status: 'DNS_OR_NETWORK_ERROR', message: code + ': ' + message };
  }
  if (['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(code) || /timeout|timed out/i.test(message)) {
    return { status: 'TIMEOUT', message };
  }
  return { status: 'HTTP_ERROR', message };
}

function countFixtures(body: any): number | null {
  if (Array.isArray(body)) return body.length;
  for (const key of ['response', 'data', 'fixtures']) {
    if (Array.isArray(body?.[key])) return body[key].length;
  }
  return null;
}

async function checkProvider(provider: string, configured: boolean, url: URL | null, headers: Record<string, string> = {}): Promise<ProviderResult> {
  if (!configured || !url) return { provider, configured: false, status: 'NOT_CONFIGURED' };
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(15000) });
    if (response.status === 401 || response.status === 403) {
      return { provider, configured: true, status: 'AUTH_FAILED', httpStatus: response.status, message: 'Provider rejected credentials or access plan; credential values were not printed.' };
    }
    if (response.status === 429) return { provider, configured: true, status: 'RATE_LIMITED', httpStatus: response.status };
    if (!response.ok) return { provider, configured: true, status: 'HTTP_ERROR', httpStatus: response.status, message: 'Provider returned a non-success HTTP status.' };
    let body: any;
    try { body = await response.json(); }
    catch { return { provider, configured: true, status: 'INVALID_RESPONSE', httpStatus: response.status, message: 'Response was not valid JSON.' }; }
    const fixtureCount = countFixtures(body);
    if (fixtureCount === null) return { provider, configured: true, status: 'INVALID_RESPONSE', httpStatus: response.status, message: 'Could not find a fixture array in the response.' };
    return { provider, configured: true, status: 'OK', httpStatus: response.status, fixtureCount };
  } catch (error) {
    return { provider, configured: true, ...classifyError(error) };
  }
}

async function main(): Promise<void> {
  const sportApiKey = (process.env.SPORTAPI_AI_KEY || process.env.SPORTAPI_API_KEY || '').trim();
  const sportApiBase = (process.env.SPORTAPI_AI_BASE_URL || 'https://sportapi.ai/api').replace(/\/+$/, '');
  const sportApiUrl = sportApiKey ? new URL(sportApiBase + '/fixtures/date/' + encodeURIComponent(date)) : null;

  const sportmonksRaw = (process.env.SPORTMONKS_API_KEY || process.env.SPORTMONKS_API_TOKEN || '').trim();
  const sportmonksKey = ['undefined', 'null', 'your_key_here', 'placeholder'].includes(sportmonksRaw.toLowerCase()) ? '' : sportmonksRaw;
  const sportmonksBase = (process.env.SPORTMONKS_BASE_URL || 'https://api.sportmonks.com/v3/football').replace(/\/+$/, '');
  const sportmonksUrl = sportmonksKey ? new URL(sportmonksBase + '/fixtures/date/' + date + '?include=participants%3Bscores%3Bleague%3Bstate') : null;

  // Match serverFootballApis.ts: an explicitly configured direct API-SPORTS key wins.
  const directFootballKey = (process.env.API_FOOTBALL_KEY || '').trim();
  const footballKey = (directFootballKey || process.env.API_FOOTBALL_USE_RAPIDAPI || '').trim();
  const footballRapid = !directFootballKey && (Boolean(process.env.API_FOOTBALL_USE_RAPIDAPI?.trim()) || Boolean(process.env.API_FOOTBALL_RAPIDAPI_HOST?.trim()));
  const defaultFootballBase = footballRapid
    ? 'https://api-football-v1.p.rapidapi.com/v3'
    : 'https://v3.football.api-sports.io';
  const footballBase = (process.env.API_FOOTBALL_BASE_URL || defaultFootballBase).replace(/\\/+$/, '');
  const footballUrl = footballKey ? new URL(footballBase + '/fixtures?date=' + encodeURIComponent(date)) : null;
  const footballHeaders = footballRapid
    ? { 'x-rapidapi-key': footballKey, 'x-rapidapi-host': process.env.API_FOOTBALL_RAPIDAPI_HOST?.trim() || new URL(footballBase).host }
    : { 'x-apisports-key': footballKey };

  const results = await Promise.all([
    checkProvider('SportAPI.ai', Boolean(sportApiKey), sportApiUrl, sportApiKey ? { 'X-Api-Key': sportApiKey, Authorization: 'Bearer ' + sportApiKey } : {}),
    checkProvider('Sportmonks', Boolean(sportmonksKey), sportmonksUrl, sportmonksKey ? { Authorization: sportmonksKey } : {}),
    checkProvider('API-Football', Boolean(footballKey), footballUrl, footballHeaders),
  ]);

  console.log('Read-only football provider connectivity check for ' + date);
  console.log('No provider keys or raw fixture payloads are printed.');
  console.table(results.map(({ provider, configured, status, httpStatus, fixtureCount, message }) => ({
    provider, configured, status, httpStatus: httpStatus ?? '', fixtureCount: fixtureCount ?? '', message: message ?? '',
  })));
  const configured = results.filter(result => result.configured);
  if (configured.length === 0) console.log('No provider credentials were detected in the local environment.');
  else if (configured.every(result => result.status !== 'OK')) {
    console.log('No configured provider returned a valid fixture list. Network/DNS failures are not authentication failures.');
  }
}

main().catch(error => {
  console.error('Provider check failed unexpectedly:', String((error as any)?.message || error));
  process.exitCode = 1;
});

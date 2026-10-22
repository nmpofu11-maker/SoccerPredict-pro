import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seasonCode, currentSeasonStart, planRequests, syncFootballDataCoUk, FD_LIMITS, FD_MAIN_LEAGUES,
} from '../src/services/footballDataCoUk';
import { buildTrainingSet, mergeRows } from '../src/services/historicalImport';

// Header layout as documented by football-data.co.uk (main leagues), odds columns included on purpose.
const MAIN_HEADER = 'Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG,HTR,Referee,HS,AS,HST,AST,HF,AF,HC,AC,HY,AY,HR,AR,B365H,B365D,B365A,BWH,BWD,BWA,PSH,PSD,PSA,MaxH,MaxD,MaxA,AvgH,AvgD,AvgA,B365CH,B365CD,B365CA';
const mainRow = (d: string, h: string, a: string, hg: number, ag: number) =>
  `E0,${d},15:00,${h},${a},${hg},${ag},${hg > ag ? 'H' : hg < ag ? 'A' : 'D'},0,0,D,A Ref,10,8,${4 + hg},${3 + ag},9,9,5,4,1,2,0,0,2.1,3.4,3.6,2.0,3.3,3.7,2.1,3.5,3.6,2.2,3.6,3.9,2.05,3.4,3.7,2.0,3.5,3.8`;

const bytes = (s: string) => new TextEncoder().encode(s);
const resp = (status: number, body: Uint8Array | string = '') => ({
  ok: status >= 200 && status < 300, status,
  arrayBuffer: async () => { const b = typeof body === 'string' ? bytes(body) : body; return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; },
});
const noSleep = async () => {};

test('seasonCode and currentSeasonStart', () => {
  assert.equal(seasonCode(2024), '2425');
  assert.equal(seasonCode(1999), '9900');
  assert.equal(seasonCode(2009), '0910');
  assert.equal(currentSeasonStart(new Date('2026-10-22T00:00:00Z')), 2026);
  assert.equal(currentSeasonStart(new Date('2026-03-01T00:00:00Z')), 2025);
});

test('planRequests builds only whitelisted football-data.co.uk URLs', () => {
  const plan = planRequests(['e0', 'D1'], 2023, 2024);
  assert.deepEqual(plan.map(p => p.url), [
    'https://football-data.co.uk/mmz4281/2324/E0.csv',
    'https://football-data.co.uk/mmz4281/2425/E0.csv',
    'https://football-data.co.uk/mmz4281/2324/D1.csv',
    'https://football-data.co.uk/mmz4281/2425/D1.csv',
  ]);
  assert.equal(planRequests(['BRA'], 2020, 2024)[0].url, 'https://football-data.co.uk/new/BRA.csv');
});

test('planRequests rejects anything that could become an arbitrary URL or an abusive crawl', () => {
  assert.throws(() => planRequests(['../../etc/passwd'], 2023, 2024), /Unknown league code/);
  assert.throws(() => planRequests(['http://evil.example'], 2023, 2024), /Unknown league code/);
  assert.throws(() => planRequests([], 2023, 2024), /at least one league/);
  assert.throws(() => planRequests(['E0'], 1980, 2024), /Seasons start at/);
  assert.throws(() => planRequests(['E0'], 2025, 2024), /before/);
  assert.throws(() => planRequests(['E0'], 2023.5, 2024), /whole years/);
  const many = FD_MAIN_LEAGUES.map(l => l.code);
  assert.throws(() => planRequests(many, 2000, 2025), /limit is/);
});

test('sync: parses files, labels season from the provider code, ignores odds, reports per-file outcomes', async () => {
  const csv = [MAIN_HEADER, mainRow('10/08/2024', 'Alpha', 'Beta', 2, 1), mainRow('17/08/2024', 'Beta', 'Gamma', 0, 0)].join('\n');
  const seen: string[] = [];
  const res = await syncFootballDataCoUk(planRequests(['E0'], 2024, 2025), {
    delayMs: 0, sleep: noSleep,
    fetchImpl: async (url, init) => {
      seen.push(url);
      assert.match(init?.headers?.['User-Agent'] || '', /SoccerPredict-pro/);
      return url.includes('2425') ? resp(200, bytes(csv)) : resp(404);
    },
  });
  assert.deepEqual(res.outcomes.map(o => o.status), ['ok', 'not_published']);
  assert.equal(res.rows.length, 2);
  assert.ok(res.rows.every(r => r.season === '2425' && r.league === 'England • Premier League'));
  assert.equal(res.rows[0].hst, 6); // shots on target kept (4+2) ...
  assert.ok(res.outcomes[0].report!.oddsColumnsIgnored.includes('B365H')); // ... odds only reported as ignored
  assert.ok(!JSON.stringify(res.rows).includes('2.1'), 'no odds retained');
});

test('sync: HTML-with-200, HTTP 500, oversized file and thrown network errors are reported, never fatal', async () => {
  const big = new Uint8Array(FD_LIMITS.maxBytesPerFile + 1);
  const urls = planRequests(['E0', 'E1', 'D1', 'I1'], 2024, 2024);
  const res = await syncFootballDataCoUk(urls, {
    delayMs: 0, sleep: noSleep,
    fetchImpl: async (url) => {
      if (url.includes('/E0')) return resp(200, '<html><body>Not found</body></html>');
      if (url.includes('/E1')) return resp(500);
      if (url.includes('/D1')) return resp(200, big);
      throw new Error('ECONNRESET');
    },
  });
  assert.deepEqual(res.outcomes.map(o => o.status), ['not_published', 'failed', 'failed', 'failed']);
  assert.match(res.outcomes[2].detail || '', /larger than/);
  assert.equal(res.rows.length, 0);
});

test('sync: Windows-1252 bytes (real files often are) keep accents', async () => {
  const text = [MAIN_HEADER, mainRow('10/08/2024', 'Atlético', 'Málaga', 1, 0)].join('\n');
  const latin1 = Uint8Array.from([...text].map(c => c.charCodeAt(0)));
  const res = await syncFootballDataCoUk(planRequests(['E0'], 2024, 2024), { delayMs: 0, sleep: noSleep, fetchImpl: async () => resp(200, latin1) });
  assert.equal(res.rows[0].home, 'Atlético');
});

test('sync: requests are sequential and throttled', async () => {
  const sleeps: number[] = [];
  let inFlight = 0, maxInFlight = 0;
  await syncFootballDataCoUk(planRequests(['E0'], 2022, 2024), {
    delayMs: 700, sleep: async ms => { sleeps.push(ms); },
    fetchImpl: async () => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await Promise.resolve(); inFlight--; return resp(404); },
  });
  assert.equal(maxInFlight, 1);
  assert.deepEqual(sleeps, [700, 700]); // between files, none before the first
});

test('extra-league file: Country+League kept, rows before the chosen start date dropped', async () => {
  const csv = [
    'Country,League,Season,Date,Time,Home,Away,HG,AG,Res,PH,PD,PA,MaxH,MaxD,MaxA,AvgH,AvgD,AvgA',
    'Brazil,Serie A,2019,05/05/2019,16:00,Flamengo RJ,Santos,2,1,H,1.5,4,6,1.6,4.1,6.2,1.55,4,6',
    'Brazil,Serie A,2023,15/04/2023,16:00,Flamengo RJ,Santos,1,1,D,1.5,4,6,1.6,4.1,6.2,1.55,4,6',
  ].join('\n');
  const res = await syncFootballDataCoUk(planRequests(['BRA'], 2022, 2024), { delayMs: 0, sleep: noSleep, fetchImpl: async () => resp(200, bytes(csv)) });
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0].league, 'Brazil • Serie A');
  assert.equal(res.rows[0].date, '2023-04-15');
});

test('end to end: synced seasons -> merged -> point-in-time set carries prior-season pedigree', async () => {
  // 8 teams, 2 seasons, deterministic. Season rows come from different "files" like a real multi-season sync.
  const teams = Array.from({ length: 8 }, (_, i) => `T${i}`);
  const season = (y: number) => {
    const lines = [MAIN_HEADER];
    let day = Date.UTC(y, 7, 1);
    for (let leg = 0; leg < 2; leg++) for (let r = 0; r < 7; r++) {
      for (let m = 0; m < 4; m++) {
        const a = m === 0 ? 0 : ((r + m) % 7) + 1, b = ((r + 7 - m) % 7) + 1;
        const [h, aw] = leg === 0 ? [a, b] : [b, a];
        const d = new Date(day); const ds = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
        lines.push(mainRow(ds, teams[h], teams[aw], h < aw ? 2 : 0, h < aw ? 0 : 1));
      }
      day += 7 * 86_400_000;
    }
    return lines.join('\n');
  };
  const res = await syncFootballDataCoUk(planRequests(['E0'], 2024, 2025), {
    delayMs: 0, sleep: noSleep,
    fetchImpl: async url => resp(200, bytes(url.includes('2425') ? season(2024) : season(2025))),
  });
  assert.equal(res.outcomes.every(o => o.status === 'ok'), true);
  const { merged, duplicates } = mergeRows([], res.rows);
  assert.equal(duplicates, 0);
  const { results, summary } = buildTrainingSet(merged);
  assert.equal(summary.leagues, 1);
  const s2 = results.find(r => r.date >= '2025-08-01' && r.fixture.homeTeam.name === 'T0')!;
  assert.equal(s2.fixture.homeTeam.lastSeasonRank, 1);
  assert.equal(s2.fixture.homeTeam.advancedStatsSource, 'HISTORICAL_IMPORT');
});

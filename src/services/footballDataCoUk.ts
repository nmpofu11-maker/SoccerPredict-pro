/**
 * football-data.co.uk provider: free, public CSV archives of completed matches (results, and shots on target
 * for many leagues). It is used ONLY as a historical-results source for training.
 *
 *  - Odds columns present in these files are ignored by the importer (see historicalImport.ts). They never
 *    become features.
 *  - URLs are built from a fixed host + validated codes; callers cannot supply arbitrary URLs.
 *  - Requests are sequential and throttled; responses are size-capped; a 404 means "not published", not an error.
 *  - Coverage is Europe-heavy plus a set of "extra leagues". It does NOT cover South Africa's PSL.
 *
 * Layout (confirmed by several independent client libraries; not checkable from the build sandbox, so
 * the first live sync is the real test and every file reports its own outcome):
 *   main leagues : https://www.football-data.co.uk/mmz4281/<yyzz>/<DIV>.csv       one file per season
 *   extra leagues: https://www.football-data.co.uk/new/<CODE>.csv                 one file, all seasons
 */
import { decodeText, tableToRows, parseCsv, type ImportedMatchRow, type ImportFileReport } from './historicalImport';

export const FD_BASE = 'https://www.football-data.co.uk';

export interface FdLeague { code: string; name: string; kind: 'main' | 'extra' }

export const FD_MAIN_LEAGUES: FdLeague[] = [
  { code: 'E0', name: 'England • Premier League', kind: 'main' },
  { code: 'E1', name: 'England • Championship', kind: 'main' },
  { code: 'E2', name: 'England • League One', kind: 'main' },
  { code: 'E3', name: 'England • League Two', kind: 'main' },
  { code: 'EC', name: 'England • National League', kind: 'main' },
  { code: 'SC0', name: 'Scotland • Premiership', kind: 'main' },
  { code: 'SC1', name: 'Scotland • Championship', kind: 'main' },
  { code: 'D1', name: 'Germany • Bundesliga', kind: 'main' },
  { code: 'D2', name: 'Germany • 2. Bundesliga', kind: 'main' },
  { code: 'I1', name: 'Italy • Serie A', kind: 'main' },
  { code: 'I2', name: 'Italy • Serie B', kind: 'main' },
  { code: 'SP1', name: 'Spain • La Liga', kind: 'main' },
  { code: 'SP2', name: 'Spain • La Liga 2', kind: 'main' },
  { code: 'F1', name: 'France • Ligue 1', kind: 'main' },
  { code: 'F2', name: 'France • Ligue 2', kind: 'main' },
  { code: 'N1', name: 'Netherlands • Eredivisie', kind: 'main' },
  { code: 'B1', name: 'Belgium • Pro League', kind: 'main' },
  { code: 'P1', name: 'Portugal • Primeira Liga', kind: 'main' },
  { code: 'T1', name: 'Turkey • Super Lig', kind: 'main' },
  { code: 'G1', name: 'Greece • Super League', kind: 'main' },
];

/** Country codes of the "extra leagues" files (Argentina, Brazil, USA, ...). */
export const FD_EXTRA_LEAGUES: FdLeague[] = [
  ['ARG', 'Argentina'], ['AUT', 'Austria'], ['BRA', 'Brazil'], ['CHN', 'China'], ['DNK', 'Denmark'],
  ['FIN', 'Finland'], ['IRL', 'Ireland'], ['JPN', 'Japan'], ['MEX', 'Mexico'], ['NOR', 'Norway'],
  ['POL', 'Poland'], ['ROU', 'Romania'], ['RUS', 'Russia'], ['SWE', 'Sweden'], ['SWZ', 'Switzerland'], ['USA', 'USA'],
].map(([code, name]) => ({ code, name: `${name} (all listed divisions)`, kind: 'extra' as const }));

export const FD_LIMITS = {
  maxFilesPerSync: 60,
  maxBytesPerFile: 8 * 1024 * 1024,
  requestTimeoutMs: 20_000,
  defaultDelayMs: 700,
  earliestSeasonStart: 1993,
} as const;

const KNOWN = new Map<string, FdLeague>([...FD_MAIN_LEAGUES, ...FD_EXTRA_LEAGUES].map(l => [l.code, l]));

/** 2024 -> "2425", 1999 -> "9900" */
export function seasonCode(startYear: number): string {
  const yy = (n: number) => String(n % 100).padStart(2, '0');
  return `${yy(startYear)}${yy(startYear + 1)}`;
}

/** Season that is in progress on `now` (European convention: starts in July/August). */
export function currentSeasonStart(now: Date = new Date()): number {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export interface FdRequest { code: string; kind: 'main' | 'extra'; seasonStart?: number; fromDate?: string; url: string; label: string }

export function planRequests(codes: string[], fromSeasonStart: number, toSeasonStart: number): FdRequest[] {
  if (!Number.isInteger(fromSeasonStart) || !Number.isInteger(toSeasonStart)) throw new Error('Seasons must be whole years');
  if (fromSeasonStart < FD_LIMITS.earliestSeasonStart) throw new Error(`Seasons start at ${FD_LIMITS.earliestSeasonStart}`);
  if (toSeasonStart < fromSeasonStart) throw new Error('"to" season is before "from" season');
  const out: FdRequest[] = [];
  for (const raw of [...new Set(codes.map(c => String(c).trim().toUpperCase()))]) {
    const league = KNOWN.get(raw);
    if (!league) throw new Error(`Unknown league code "${raw}"`); // whitelist: never builds a URL from free text
    if (league.kind === 'extra') {
      out.push({ code: raw, kind: 'extra', fromDate: `${fromSeasonStart}-01-01`, url: `${FD_BASE}/new/${raw}.csv`, label: `${raw} (all seasons)` });
    } else {
      for (let y = fromSeasonStart; y <= toSeasonStart; y++) {
        out.push({ code: raw, kind: 'main', seasonStart: y, url: `${FD_BASE}/mmz4281/${seasonCode(y)}/${raw}.csv`, label: `${raw} ${seasonCode(y)}` });
      }
    }
  }
  if (out.length === 0) throw new Error('Pick at least one league');
  if (out.length > FD_LIMITS.maxFilesPerSync) {
    throw new Error(`That would download ${out.length} files; the limit is ${FD_LIMITS.maxFilesPerSync} per sync. Narrow the seasons or leagues and sync in batches.`);
  }
  return out;
}

export interface FdFileOutcome {
  label: string;
  url: string;
  status: 'ok' | 'not_published' | 'failed';
  detail?: string;
  report?: ImportFileReport;
}

export interface FdSyncResult {
  rows: ImportedMatchRow[];
  outcomes: FdFileOutcome[];
}

type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean; status: number; arrayBuffer: () => Promise<ArrayBuffer>; headers?: { get(name: string): string | null };
}>;

export async function syncFootballDataCoUk(
  requests: FdRequest[],
  opts: { fetchImpl?: FetchLike; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {}
): Promise<FdSyncResult> {
  const doFetch: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init) as unknown as ReturnType<FetchLike>);
  const delayMs = opts.delayMs ?? FD_LIMITS.defaultDelayMs;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const rows: ImportedMatchRow[] = [];
  const outcomes: FdFileOutcome[] = [];

  for (let i = 0; i < requests.length; i++) {
    const rq = requests[i];
    if (i > 0 && delayMs > 0) await sleep(delayMs); // be a polite guest on a free service
    try {
      const res = await doFetch(rq.url, {
        headers: { 'User-Agent': 'SoccerPredict-pro historical-training (low-volume, cached)', Accept: 'text/csv,*/*' },
        signal: AbortSignal.timeout(FD_LIMITS.requestTimeoutMs),
      });
      if (res.status === 404) { outcomes.push({ label: rq.label, url: rq.url, status: 'not_published' }); continue; }
      if (!res.ok) { outcomes.push({ label: rq.label, url: rq.url, status: 'failed', detail: `HTTP ${res.status}` }); continue; }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > FD_LIMITS.maxBytesPerFile) {
        outcomes.push({ label: rq.label, url: rq.url, status: 'failed', detail: `file larger than ${FD_LIMITS.maxBytesPerFile} bytes` });
        continue;
      }
      const text = decodeText(buf);
      if (/^\s*</.test(text)) { // an HTML error/landing page served with 200
        outcomes.push({ label: rq.label, url: rq.url, status: 'not_published', detail: 'server returned a web page, not a CSV' });
        continue;
      }
      const fileName = `football-data.co.uk:${rq.label}`;
      const { rows: parsed, report } = tableToRows(parseCsv(text), fileName);
      let kept = parsed;
      if (rq.kind === 'main' && rq.seasonStart !== undefined) {
        // The provider's own season code is authoritative for the main files (no Season column in them).
        const code = seasonCode(rq.seasonStart);
        kept = parsed.map(r => ({ ...r, season: code }));
      } else if (rq.kind === 'extra') {
        kept = rq.fromDate ? parsed.filter(r => r.date >= (rq.fromDate as string)) : parsed; // these carry their own Season column
      }
      rows.push(...kept);
      outcomes.push({ label: rq.label, url: rq.url, status: 'ok', report });
    } catch (e) {
      outcomes.push({ label: rq.label, url: rq.url, status: 'failed', detail: e instanceof Error ? e.message : 'request failed' });
    }
  }
  return { rows, outcomes };
}

/**
 * Historical results import (CSV / XLSX / ZIP of either).
 *
 * DESIGN RULES (these exist because of the earlier odds-derived-stats regression):
 *  1. Only completed-match facts are read: date, league, teams, full-time score and,
 *     when present, shots on target. Nothing is invented.
 *  2. Bookmaker odds columns (B365H, PSH, AvgH, ...) are detected and IGNORED. They are never
 *     parsed into a number, never stored and never used as a feature.
 *  3. Rank / points / form / H2H / shots-on-target for a match are computed POINT-IN-TIME from the
 *     imported results themselves, using only matches played strictly before that match's date.
 *     Anything that cannot be computed from enough prior matches stays null / empty.
 *  4. Everything derived here is labelled source 'HISTORICAL_IMPORT', never a real provider name.
 */
import { unzipSync } from 'fflate';
import { fixtureHasEvidence } from '../engine/rulesEngine';
import type { HistoricalMatchResult, MatchFixture, TeamStats, H2HRecord } from '../types/soccer';

/** Compact stored row. This (not the derived features) is what gets persisted. */
export interface ImportedMatchRow {
  key: string; // stable dedupe key
  date: string; // YYYY-MM-DD
  league: string;
  home: string;
  away: string;
  hg: number;
  ag: number;
  season?: string; // only when the source states it (provider season code or a Season column)
  hst?: number; // home shots on target, only when present in the file
  ast?: number;
  src: string; // file name it came from
}

export interface ImportFileReport {
  file: string;
  rowsRead: number;
  rowsAccepted: number;
  rowsSkipped: number;
  skipReasons: Record<string, number>;
  oddsColumnsIgnored: string[];
  note?: string;
}

export interface ImportReport {
  files: ImportFileReport[];
  skippedEntries: { name: string; reason: string }[];
  rows: ImportedMatchRow[];
}

export const IMPORT_LIMITS = {
  maxEntries: 1000,
  maxEntryBytes: 100 * 1024 * 1024,
  maxTotalBytes: 400 * 1024 * 1024,
  maxRows: 1_000_000,
} as const;

/** football-data.co.uk documented division codes. Unknown codes are kept verbatim, not guessed. */
const DIV_NAMES: Record<string, string> = {
  E0: 'England • Premier League', E1: 'England • Championship', E2: 'England • League One',
  E3: 'England • League Two', EC: 'England • National League',
  SC0: 'Scotland • Premiership', SC1: 'Scotland • Championship', SC2: 'Scotland • League One', SC3: 'Scotland • League Two',
  D1: 'Germany • Bundesliga', D2: 'Germany • 2. Bundesliga',
  I1: 'Italy • Serie A', I2: 'Italy • Serie B',
  SP1: 'Spain • La Liga', SP2: 'Spain • La Liga 2',
  F1: 'France • Ligue 1', F2: 'France • Ligue 2',
  N1: 'Netherlands • Eredivisie', B1: 'Belgium • Pro League', P1: 'Portugal • Primeira Liga',
  T1: 'Turkey • Super Lig', G1: 'Greece • Super League',
};

const norm = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const COLS = {
  date: ['date', 'matchdate', 'kickoff', 'kickofftime', 'datetime'],
  home: ['hometeam', 'home', 'hometeamname', 'team1'],
  away: ['awayteam', 'away', 'awayteamname', 'team2'],
  hg: ['fthg', 'hg', 'homegoals', 'homescore', 'fthomegoals', 'homegoalsft', 'fulltimehomegoals'],
  ag: ['ftag', 'ag', 'awaygoals', 'awayscore', 'ftawaygoals', 'awaygoalsft', 'fulltimeawaygoals'],
  ftr: ['ftr', 'result', 'res', 'fulltimeresult'],
  league: ['div', 'league', 'competition', 'leaguename'],
  country: ['country'],
  season: ['season'],
  hst: ['hst', 'homeshotsontarget', 'hsot'],
  ast: ['ast', 'awayshotsontarget', 'asot'],
} as const;

/** Bookmaker price columns, e.g. B365H, PSD, AvgA, MaxH, B365>2.5. Detected only so we can report them as ignored. */
const ODDS_COL = /^p[hda]$|^(b365|bw|iw|lb|ps|psc|wh|vc|sj|gb|sb|max|avg|bb|bf|1xb|cl)[a-z]*[hda]$|^(b365|bw|iw|lb|ps|wh|vc|max|avg|bbmx|bbav)(>|<|over|under|ah|c)/;

// ---------- text decoding ----------

/** football-data.co.uk files are frequently Windows-1252, not UTF-8. Try strict UTF-8 first, then fall back. */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// ---------- CSV ----------

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 } as Record<string, number>;
  for (const ch of firstLine) if (ch in counts) counts[ch]++;
  const delim = (Object.keys(counts) as string[]).sort((a, b) => counts[b] - counts[a])[0] || ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  return rows;
}

// ---------- date handling ----------

const pad = (n: number) => String(n).padStart(2, '0');

export function toIsoDate(v: unknown): string | null {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  // dd/mm/yyyy or dd/mm/yy (football-data convention). Day-first is assumed and documented.
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?!\d)/);
  if (m) {
    let y = +m[3];
    if (m[3].length === 2) y += y >= 70 ? 1900 : 2000;
    return validDate(y, +m[2], +m[1]);
  }
  return null;
}

function validDate(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1850 || y > 2200) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

// ---------- table -> rows ----------

const intOrNull = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v < 100 ? v : null;
  const s = String(v ?? '').trim();
  return /^\d{1,2}$/.test(s) ? Number(s) : null;
};

const cleanName = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();

export function tableToRows(table: unknown[][], fileName: string): { rows: ImportedMatchRow[]; report: ImportFileReport } {
  const report: ImportFileReport = {
    file: fileName, rowsRead: 0, rowsAccepted: 0, rowsSkipped: 0, skipReasons: {}, oddsColumnsIgnored: [],
  };
  const skip = (reason: string) => {
    report.rowsSkipped++;
    report.skipReasons[reason] = (report.skipReasons[reason] || 0) + 1;
  };

  if (table.length < 2) { report.note = 'No data rows'; return { rows: [], report }; }
  const header = table[0].map(norm);
  const find = (names: readonly string[]) => header.findIndex(h => names.includes(h));
  const idx = {
    date: find(COLS.date), home: find(COLS.home), away: find(COLS.away), hg: find(COLS.hg), ag: find(COLS.ag),
    ftr: find(COLS.ftr), league: find(COLS.league), hst: find(COLS.hst), ast: find(COLS.ast),
    country: find(COLS.country), season: find(COLS.season),
  };
  report.oddsColumnsIgnored = table[0].map(String).filter(h => ODDS_COL.test(norm(h)));

  const missing = (['date', 'home', 'away', 'hg', 'ag'] as const).filter(k => idx[k] < 0);
  if (missing.length) {
    report.note = `Missing required column(s): ${missing.join(', ')}. Need date, home team, away team, full-time home goals, full-time away goals.`;
    report.rowsRead = table.length - 1;
    report.rowsSkipped = report.rowsRead;
    report.skipReasons['file_missing_required_columns'] = report.rowsRead;
    return { rows: [], report };
  }

  const fileStem = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const rows: ImportedMatchRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    report.rowsRead++;
    const date = toIsoDate(line[idx.date]);
    const home = cleanName(line[idx.home]);
    const away = cleanName(line[idx.away]);
    if (!date) { skip('bad_or_missing_date'); continue; }
    if (!home || !away) { skip('missing_team'); continue; }
    if (norm(home) === norm(away)) { skip('same_team_both_sides'); continue; }
    const hg = intOrNull(line[idx.hg]);
    const ag = intOrNull(line[idx.ag]);
    if (hg === null || ag === null) { skip('no_full_time_score'); continue; } // unplayed / abandoned / malformed
    if (idx.ftr >= 0) {
      const ftr = String(line[idx.ftr] ?? '').trim().toUpperCase();
      const implied = hg > ag ? 'H' : hg < ag ? 'A' : 'D';
      if (ftr && ['H', 'D', 'A'].includes(ftr) && ftr !== implied) { skip('result_contradicts_score'); continue; }
    }
    const leagueRaw = idx.league >= 0 ? cleanName(line[idx.league]) : '';
    const countryRaw = idx.country >= 0 ? cleanName(line[idx.country]) : '';
    // "extra leagues" files carry Country + League (e.g. Brazil / Serie A); keep both so leagues never collide.
    const league = leagueRaw
      ? (DIV_NAMES[leagueRaw.toUpperCase()] || (countryRaw ? `${countryRaw} • ${leagueRaw}` : leagueRaw))
      : fileStem;
    const seasonRaw = idx.season >= 0 ? cleanName(line[idx.season]) : '';
    const hst = idx.hst >= 0 ? intOrNull(line[idx.hst]) : null;
    const ast = idx.ast >= 0 ? intOrNull(line[idx.ast]) : null;
    rows.push({
      key: `${norm(league)}|${date}|${norm(home)}|${norm(away)}`,
      date, league, home, away, hg, ag,
      ...(seasonRaw ? { season: seasonRaw } : {}),
      ...(hst !== null && ast !== null ? { hst, ast } : {}),
      src: fileName,
    });
    report.rowsAccepted++;
  }
  return { rows, report };
}

// ---------- file / zip entry points ----------

async function xlsxToTables(bytes: Uint8Array): Promise<unknown[][][]> {
  const mod: any = await import('read-excel-file/node');
  const out = await mod.default(Buffer.from(bytes));
  // v9: default export returns all sheets as [{ sheet, data }]; tolerate a plain row array too.
  if (Array.isArray(out) && out.length && out[0] && Array.isArray(out[0].data)) return out.map((s: any) => s.data);
  return [out as unknown[][]];
}

export async function importSingleFile(name: string, bytes: Uint8Array): Promise<{ rows: ImportedMatchRow[]; reports: ImportFileReport[] }> {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt') || lower.endsWith('.tsv')) {
    const { rows, report } = tableToRows(parseCsv(decodeText(bytes)), name);
    return { rows, reports: [report] };
  }
  if (lower.endsWith('.xlsx')) {
    const tables = await xlsxToTables(bytes);
    const rows: ImportedMatchRow[] = [];
    const reports: ImportFileReport[] = [];
    tables.forEach((t, i) => {
      const res = tableToRows(t, tables.length > 1 ? `${name}#sheet${i + 1}` : name);
      rows.push(...res.rows);
      reports.push(res.report);
    });
    return { rows, reports };
  }
  throw new Error(`Unsupported file type: ${name}`);
}

export async function importFromBuffer(fileName: string, bytes: Uint8Array): Promise<ImportReport> {
  const result: ImportReport = { files: [], skippedEntries: [], rows: [] };
  const lower = fileName.toLowerCase();

  const handle = async (name: string, data: Uint8Array) => {
    try {
      const r = await importSingleFile(name, data);
      result.rows.push(...r.rows);
      result.files.push(...r.reports);
    } catch (e) {
      result.skippedEntries.push({ name, reason: e instanceof Error ? e.message : 'unreadable' });
    }
    if (result.rows.length > IMPORT_LIMITS.maxRows) throw new Error(`Too many rows (limit ${IMPORT_LIMITS.maxRows}).`);
  };

  if (!lower.endsWith('.zip')) {
    await handle(fileName, bytes);
    return result;
  }

  // Zip-bomb guard: entry sizes are checked from the central directory BEFORE anything is inflated.
  let entries = 0;
  let total = 0;
  const wanted: Record<string, true> = {};
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        entries++;
        if (entries > IMPORT_LIMITS.maxEntries) throw new Error(`Zip has more than ${IMPORT_LIMITS.maxEntries} entries.`);
        const n = f.name;
        const base = n.replace(/^.*\//, '');
        if (n.endsWith('/') || n.startsWith('__MACOSX/') || base.startsWith('.') || base.startsWith('~$')) return false;
        const ext = base.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || '';
        if (!['.csv', '.xlsx', '.tsv', '.txt'].includes(ext)) {
          result.skippedEntries.push({ name: n, reason: ext === '.xls' ? 'legacy .xls not supported — re-save as .xlsx or .csv' : 'not a csv/xlsx file' });
          return false;
        }
        if (f.originalSize > IMPORT_LIMITS.maxEntryBytes) {
          result.skippedEntries.push({ name: n, reason: `entry too large (${f.originalSize} bytes)` });
          return false;
        }
        total += f.originalSize;
        if (total > IMPORT_LIMITS.maxTotalBytes) throw new Error('Zip expands beyond the allowed total size.');
        wanted[n] = true;
        return true;
      },
    });
  } catch (e) {
    throw new Error(e instanceof Error ? `Could not read zip: ${e.message}` : 'Could not read zip');
  }

  for (const name of Object.keys(files).sort()) await handle(name, files[name]);
  return result;
}

// ---------- merge / dedupe ----------

export function mergeRows(existing: ImportedMatchRow[], incoming: ImportedMatchRow[]): { merged: ImportedMatchRow[]; added: number; duplicates: number } {
  const map = new Map<string, ImportedMatchRow>();
  for (const row of existing) {
    const prior = map.get(row.key);
    if (prior && (prior.hg !== row.hg || prior.ag !== row.ag)) {
      throw new Error(`Stored historical data already contains conflicting scores for ${row.date} ${row.home} vs ${row.away}; resolve the existing duplicate before importing more data.`);
    }
    if (!prior) map.set(row.key, row);
  }

  let added = 0;
  let duplicates = 0;
  for (const row of incoming) {
    const prior = map.get(row.key);
    if (prior) {
      duplicates++;
      if (prior.hg !== row.hg || prior.ag !== row.ag) {
        throw new Error(
          `Conflicting full-time scores for ${row.date} ${row.home} vs ${row.away}: stored ${prior.hg}-${prior.ag} (${prior.src}), incoming ${row.hg}-${row.ag} (${row.src}). No import was saved; resolve the discrepancy and retry.`
        );
      }
    } else {
      map.set(row.key, row);
      added++;
    }
  }
  const merged = [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  return { merged, added, duplicates };
}

// ---------- point-in-time training set ----------

export const MIN_PRIOR_GAMES = 3;
const SEASON_GAP_DAYS = 60;

interface Played { res: 'W' | 'D' | 'L'; score: string; opp: string; venue: 'H' | 'A'; date: string; sot?: number }
interface Rec { played: number; pts: number; gf: number; ga: number }

const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

export interface TrainingSetSummary {
  totalRows: number;
  leagues: number;
  /** matches whose fixture carries at least one sourced rank/form signal, i.e. the ones training will actually use */
  usable: number;
  dateFrom: string | null;
  dateTo: string | null;
  outcomeCounts: { home: number; draw: number; away: number };
}

/**
 * Builds HistoricalMatchResult[] whose features use ONLY matches strictly earlier than each match.
 * Same-day matches are all computed before any of that day's results are applied (no same-day leakage).
 */
export function buildTrainingSet(rows: ImportedMatchRow[]): { results: HistoricalMatchResult[]; summary: TrainingSetSummary } {
  const byLeague = new Map<string, ImportedMatchRow[]>();
  for (const r of rows) {
    const arr = byLeague.get(r.league);
    if (arr) arr.push(r); else byLeague.set(r.league, [r]);
  }

  const results: HistoricalMatchResult[] = [];
  const counts = { home: 0, draw: 0, away: 0 };

  for (const [league, all] of byLeague) {
    const ordered = all.slice().sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
    const table = new Map<string, Rec>(); // current-season table; reset on season change
    const history = new Map<string, Played[]>(); // team -> all prior games in this league (across seasons)
    const meetings = new Map<string, { date: string; home: string; hg: number; ag: number }[]>();
    let lastDate: string | null = null;
    let currentSeason: string | undefined;
    // Final table of the season that just ended (Rule 2 pedigree). Only kept when that season looks complete.
    let prevSeason = new Map<string, { rank: number; points: number }>();
    const leagueHasSeasonLabels = ordered.every(r => !!r.season);

    const snapshotFinalTable = (): Map<string, { rank: number; points: number }> => {
      const out = new Map<string, { rank: number; points: number }>();
      const entries = [...table.entries()];
      if (entries.length < 8) return out;
      const played = entries.map(([, t]) => t.played);
      if (Math.min(...played) < 0.8 * Math.max(...played)) return out; // partial season: do not call it a final table
      entries
        .map(([team, t]) => ({ team, ...t, gd: t.gf - t.ga }))
        .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team))
        .forEach((e, k) => out.set(e.team, { rank: k + 1, points: e.pts }));
      return out;
    };

    let i = 0;
    while (i < ordered.length) {
      const day = ordered[i].date;
      let j = i;
      while (j < ordered.length && ordered[j].date === day) j++;
      const todays = ordered.slice(i, j);

      const daySeason = leagueHasSeasonLabels ? todays[0].season : undefined;
      const seasonChanged = leagueHasSeasonLabels
        ? currentSeason !== undefined && daySeason !== currentSeason
        : !!lastDate && daysBetween(lastDate, day) > SEASON_GAP_DAYS;
      if (seasonChanged) {
        // Pedigree only carries to the season immediately after, and only if no season is missing in between.
        prevSeason = lastDate && daysBetween(lastDate, day) <= 400 ? snapshotFinalTable() : new Map();
        table.clear();
      }
      if (leagueHasSeasonLabels) currentSeason = daySeason;

      // Rank snapshot BEFORE today's matches.
      const standing = [...table.entries()]
        .map(([team, t]) => ({ team, ...t, gd: t.gf - t.ga }))
        .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team));
      const rankOf = new Map<string, number>();
      standing.forEach((s, k) => rankOf.set(s.team, k + 1));

      const teamStats = (name: string, opp: string): TeamStats => {
        const rec = table.get(name);
        const games = history.get(name) || [];
        const last5 = games.slice(-5);
        const hasRank = !!rec && rec.played >= MIN_PRIOR_GAMES;
        const sots = games.map(g => g.sot).filter((v): v is number => typeof v === 'number').slice(-10);
        const hasSot = sots.length >= MIN_PRIOR_GAMES;
        const hasForm = games.length >= MIN_PRIOR_GAMES;
        void opp;

        // Rule 3 inputs, defined exactly as the live providers define them: >=3 home (or away) games,
        // last 5 of them, points-per-game >= 2.0.
        const ppgOf = (gs: Played[]) => gs.reduce((a, g) => a + (g.res === 'W' ? 3 : g.res === 'D' ? 1 : 0), 0) / gs.length;
        const homeGames = games.filter(g => g.venue === 'H');
        const awayGames = games.filter(g => g.venue === 'A');
        const hasHomeSample = homeGames.length >= 3;
        const hasAwaySample = awayGames.length >= 3;

        // Rule 2 pedigree. The engine treats rank >= 21 as "newly promoted", which is wrong for 22-24 team leagues,
        // so ranks above 20 are left unset rather than mis-signalled. Teams absent last season are left unset, not guessed.
        const prev = prevSeason.get(name);
        const hasPrev = !!prev && prev.rank <= 20;
        const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

        return {
          id: `imp_${norm(league)}_${norm(name)}`,
          name,
          shortName: name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'TBD',
          leagueRank: hasRank ? (rankOf.get(name) as number) : null,
          points: hasRank ? rec!.pts : null,
          ...(hasRank ? { standingsSource: 'HISTORICAL_IMPORT' as const } : {}),
          form: hasForm ? last5.map(g => g.res) : [], // chronological: oldest -> newest (app convention)
          ...(hasForm ? {
            formSource: 'HISTORICAL_IMPORT' as const,
            formScores: last5.map(g => g.score),
          } : {}),
          avgPossession: null, // never present in these files; never invented
          avgShotsOnTarget: hasSot ? Number((sots.reduce((a, b) => a + b, 0) / sots.length).toFixed(2)) : null,
          ...(hasSot ? { matchStatsSource: 'HISTORICAL_IMPORT' as const } : {}),
          isHomeDominant: hasHomeSample ? ppgOf(homeGames.slice(-5)) >= 2.0 : false,
          hasTopTierAwayForm: hasAwaySample ? ppgOf(awayGames.slice(-5)) >= 2.0 : false,
          ...(hasHomeSample || hasAwaySample ? { homeAwayFormSource: 'HISTORICAL_IMPORT' as const } : {}),
          ...(hasPrev ? {
            lastSeasonRank: prev!.rank,
            lastSeasonPoints: prev!.points,
            lastSeasonStanding: prev!.rank === 1 ? '1st (Champions)' : ord(prev!.rank),
            advancedStatsSource: 'HISTORICAL_IMPORT' as const,
          } : {}),
        };
      };

      const h2hFor = (home: string, away: string): H2HRecord | null => {
        const list = meetings.get([norm(home), norm(away)].sort().join('|')) || [];
        const last = list.slice(-5);
        if (!last.length) return null;
        let hw = 0, d = 0, aw = 0;
        const scores: string[] = [];
        for (const m of last) {
          const homeGoals = m.home === norm(home) ? m.hg : m.ag; // goals by the CURRENT home team
          const awayGoals = m.home === norm(home) ? m.ag : m.hg;
          if (homeGoals > awayGoals) hw++; else if (homeGoals < awayGoals) aw++; else d++;
          scores.push(`${homeGoals}-${awayGoals}`);
        }
        return { homeWins: hw, draws: d, awayWins: aw, totalLast5: last.length, scoresLast5: scores, source: 'HISTORICAL_IMPORT' };
      };

      const built: HistoricalMatchResult[] = [];
      for (const m of todays) {
        const outcome: 'home' | 'draw' | 'away' = m.hg > m.ag ? 'home' : m.hg < m.ag ? 'away' : 'draw';
        const fixture: MatchFixture = {
          id: `imp_${m.key}`,
          kickoffTime: `${m.date}T12:00:00Z`, // files carry no reliable kickoff time; only the date is real
          league,
          venue: 'Unknown',
          isHighStakes: false,
          motivation: 'regular',
          homeTeam: teamStats(m.home, m.away),
          awayTeam: teamStats(m.away, m.home),
          h2h: h2hFor(m.home, m.away),
        };
        built.push({
          id: `imp_${m.key}`,
          date: m.date,
          homeScore: m.hg,
          awayScore: m.ag,
          actualOutcome: outcome,
          notes: `Imported from ${m.src}; features computed from prior imported results only`,
          fixture,
        });
      }
      results.push(...built);

      // Apply today's results AFTER all of today's features were computed.
      for (const m of todays) {
        const apply = (team: string, gf: number, ga: number, venue: 'H' | 'A', opp: string, sot?: number) => {
          const t = table.get(team) || { played: 0, pts: 0, gf: 0, ga: 0 };
          t.played++; t.gf += gf; t.ga += ga; t.pts += gf > ga ? 3 : gf === ga ? 1 : 0;
          table.set(team, t);
          const arr = history.get(team) || [];
          arr.push({ res: gf > ga ? 'W' : gf === ga ? 'D' : 'L', score: `${gf}-${ga}`, opp, venue, date: m.date, ...(sot !== undefined ? { sot } : {}) });
          history.set(team, arr);
        };
        apply(m.home, m.hg, m.ag, 'H', m.away, m.hst);
        apply(m.away, m.ag, m.hg, 'A', m.home, m.ast);
        const k = [norm(m.home), norm(m.away)].sort().join('|');
        const list = meetings.get(k) || [];
        list.push({ date: m.date, home: norm(m.home), hg: m.hg, ag: m.ag });
        meetings.set(k, list);
      }
      lastDate = day;
      i = j;
    }
  }

  results.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const r of results) counts[r.actualOutcome]++;

  return {
    results,
    summary: {
      totalRows: rows.length,
      leagues: byLeague.size,
      usable: results.filter(r => fixtureHasEvidence(r.fixture)).length,
      dateFrom: results[0]?.date ?? null,
      dateTo: results[results.length - 1]?.date ?? null,
      outcomeCounts: counts,
    },
  };
}

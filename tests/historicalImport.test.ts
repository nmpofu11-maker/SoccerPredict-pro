import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import {
  parseCsv, toIsoDate, tableToRows, importFromBuffer, mergeRows, buildTrainingSet, MIN_PRIOR_GAMES,
  type ImportedMatchRow,
} from '../src/services/historicalImport';
import { fixtureHasEvidence } from '../src/engine/rulesEngine';

const HEADER = 'Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HST,AST,B365H,B365D,B365A,AvgH,AvgD,AvgA';

function csv(lines: string[], oddsMul = 1): string {
  const rows = lines.map(l => {
    const [date, h, a, hg, ag, hst, ast] = l.split('|');
    const ftr = +hg > +ag ? 'H' : +hg < +ag ? 'A' : 'D';
    const o = (n: number) => (n * oddsMul).toFixed(2);
    return `E0,${date},${h},${a},${hg},${ag},${ftr},${hst},${ast},${o(1.9)},${o(3.4)},${o(4.2)},${o(1.95)},${o(3.3)},${o(4.0)}`;
  });
  return [HEADER, ...rows].join('\n');
}

// 4 teams, weekly rounds so everyone has 3+ prior games by round 4.
const SEASON = [
  '01/08/2025|Alpha|Beta|2|0|6|2', '01/08/2025|Gamma|Delta|1|1|3|3',
  '08/08/2025|Alpha|Gamma|3|1|7|3', '08/08/2025|Beta|Delta|0|2|2|5',
  '15/08/2025|Alpha|Delta|1|0|4|2', '15/08/2025|Beta|Gamma|2|2|4|4',
  '22/08/2025|Delta|Alpha|0|0|2|3', '22/08/2025|Gamma|Beta|1|0|3|1',
  '29/08/2025|Alpha|Beta|1|2|3|4', '29/08/2025|Delta|Gamma|2|1|5|2',
];

async function rowsOf(text: string): Promise<ImportedMatchRow[]> {
  return (await importFromBuffer('E0.csv', strToU8(text))).rows;
}

test('parseCsv handles BOM, quotes and ; delimiter', () => {
  assert.deepEqual(parseCsv('\uFEFFa;b\n"x;y";2\n'), [['a', 'b'], ['x;y', '2']]);
});

test('toIsoDate: day-first dd/mm/yy, dd/mm/yyyy, ISO, rejects impossible dates', () => {
  assert.equal(toIsoDate('05/08/25'), '2025-08-05');
  assert.equal(toIsoDate('31/12/2024'), '2024-12-31');
  assert.equal(toIsoDate('2024-02-29'), '2024-02-29');
  assert.equal(toIsoDate('31/02/2024'), null);
  assert.equal(toIsoDate('garbage'), null);
});

test('standardized aggregate dataset columns import valid completed matches', async () => {
  const source = [
    'Season,League,MatchDate,HomeTeam,AwayTeam,FullTimeHomeGoals,FullTimeAwayGoals,FullTimeResult,HomeShotsOnTarget,AwayShotsOnTarget',
    '2023/24,Premier League,2023-08-11,Burnley,Manchester City,0,3,A,1,8',
    '2023/24,Premier League,2023-08-12,Arsenal,Nottingham Forest,2,1,H,5,2',
  ].join('\n');
  const result = await importFromBuffer('aggregate-results.csv', strToU8(source));
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].date, '2023-08-11');
  assert.equal(result.rows[0].league, 'Premier League');
  assert.equal(result.rows[0].home, 'Burnley');
  assert.equal(result.rows[0].away, 'Manchester City');
  assert.equal(result.rows[0].hg, 0);
  assert.equal(result.rows[0].ag, 3);
  assert.equal(result.rows[0].hst, 1);
  assert.equal(result.rows[0].ast, 8);
});

test('football-data style csv: league code mapped, odds columns reported as ignored and absent from rows', async () => {
  const res = await importFromBuffer('E0.csv', strToU8(csv(SEASON)));
  assert.equal(res.rows.length, 10);
  assert.equal(res.rows[0].league, 'England • Premier League');
  assert.ok(res.files[0].oddsColumnsIgnored.includes('B365H'));
  assert.ok(res.files[0].oddsColumnsIgnored.includes('AvgA'));
  const blob = JSON.stringify(res.rows).toLowerCase();
  assert.ok(!blob.includes('b365') && !blob.includes('1.9'), 'no odds data may be retained');
});

test('rows with missing score or contradicting FTR are skipped with reasons, not guessed', () => {
  const table = [
    ['Date', 'HomeTeam', 'AwayTeam', 'FTHG', 'FTAG', 'FTR'],
    ['01/08/2025', 'A', 'B', '2', '1', 'H'],
    ['02/08/2025', 'C', 'D', '', '', ''],
    ['03/08/2025', 'E', 'F', '2', '1', 'A'],
    ['not-a-date', 'G', 'H', '1', '1', 'D'],
  ];
  const { rows, report } = tableToRows(table, 'x.csv');
  assert.equal(rows.length, 1);
  assert.equal(report.skipReasons['no_full_time_score'], 1);
  assert.equal(report.skipReasons['result_contradicts_score'], 1);
  assert.equal(report.skipReasons['bad_or_missing_date'], 1);
});

test('missing required columns -> nothing imported, clear note', () => {
  const { rows, report } = tableToRows([['foo', 'bar'], ['1', '2']], 'x.csv');
  assert.equal(rows.length, 0);
  assert.match(report.note || '', /Missing required column/);
});

test('training features are odds-independent (changing every odds column changes nothing)', async () => {
  const a = buildTrainingSet(await rowsOf(csv(SEASON, 1))).results;
  const b = buildTrainingSet(await rowsOf(csv(SEASON, 3.7))).results;
  assert.deepEqual(a, b);
});

test('no leakage: altering a LATER match never changes an EARLIER match\'s features', async () => {
  const base = buildTrainingSet(await rowsOf(csv(SEASON))).results;
  const mutated = SEASON.slice();
  mutated[9] = '29/08/2025|Delta|Gamma|9|0|9|0'; // change the final match
  mutated[8] = '29/08/2025|Alpha|Beta|0|5|1|9';
  const alt = buildTrainingSet(await rowsOf(csv(mutated))).results;
  for (let i = 0; i < 8; i++) assert.deepEqual(alt[i].fixture, base[i].fixture, `match ${i} leaked future info`);
});

test('same-day results are not visible to same-day fixtures', async () => {
  const { results } = buildTrainingSet(await rowsOf(csv(SEASON)));
  const day1 = results.filter(r => r.date === '2025-08-01');
  for (const r of day1) {
    assert.equal(r.fixture.homeTeam.leagueRank, null);
    assert.deepEqual(r.fixture.homeTeam.form, []);
    assert.equal(r.fixture.h2h, null);
  }
});

test('evidence appears only after MIN_PRIOR_GAMES, is labelled HISTORICAL_IMPORT, and passes the engine evidence gate', async () => {
  const { results, summary } = buildTrainingSet(await rowsOf(csv(SEASON)));
  const early = results.find(r => r.date === '2025-08-08')!;
  assert.equal(early.fixture.homeTeam.leagueRank, null);
  assert.equal(fixtureHasEvidence(early.fixture), false);

  const late = results.find(r => r.date === '2025-08-29' && r.fixture.homeTeam.name === 'Alpha')!;
  assert.equal(MIN_PRIOR_GAMES, 3);
  assert.equal(late.fixture.homeTeam.standingsSource, 'HISTORICAL_IMPORT');
  assert.equal(late.fixture.homeTeam.formSource, 'HISTORICAL_IMPORT');
  assert.equal(late.fixture.homeTeam.matchStatsSource, 'HISTORICAL_IMPORT');
  assert.equal(late.fixture.homeTeam.leagueRank, 1); // Alpha: W W W D = 10 pts, top
  assert.equal(late.fixture.homeTeam.points, 10);
  assert.deepEqual(late.fixture.homeTeam.form, ['W', 'W', 'W', 'D']); // chronological
  assert.equal(late.fixture.homeTeam.avgPossession, null);
  assert.ok(fixtureHasEvidence(late.fixture));
  assert.ok(summary.usable >= 1 && summary.usable < summary.totalRows);
});

test('H2H is from the current home team\'s perspective and only uses earlier meetings', async () => {
  const { results } = buildTrainingSet(await rowsOf(csv(SEASON)));
  const last = results.find(r => r.date === '2025-08-29' && r.fixture.homeTeam.name === 'Alpha')!; // Alpha v Beta again
  // earlier Alpha(H) 2-0 Beta on 01/08 and Beta(H) 2-2 Gamma doesn't count. Only one prior Alpha/Beta game.
  assert.deepEqual(last.fixture.h2h, {
    homeWins: 1, draws: 0, awayWins: 0, totalLast5: 1, scoresLast5: ['2-0'], source: 'HISTORICAL_IMPORT',
  });
});

test('season gap resets the table (new season starts without carried-over points)', async () => {
  const next = SEASON.concat(['01/09/2026|Alpha|Beta|1|0|1|1']);
  const { results } = buildTrainingSet(await rowsOf(csv(next)));
  const m = results[results.length - 1];
  assert.equal(m.fixture.homeTeam.leagueRank, null); // table reset, < 3 games this season
  assert.ok(m.fixture.homeTeam.form.length >= 3); // but recent form legitimately carries over
});

test('mergeRows de-duplicates on re-upload', async () => {
  const rows = await rowsOf(csv(SEASON));
  const first = mergeRows([], rows);
  assert.equal(first.added, 10);
  const again = mergeRows(first.merged, rows);
  assert.equal(again.added, 0);
  assert.equal(again.duplicates, 10);
  assert.equal(again.merged.length, 10);
});

test('mergeRows rejects conflicting scores for an existing match instead of silently picking one', async () => {
  const rows = await rowsOf(csv(SEASON));
  const existing = mergeRows([], rows).merged;
  const changed = { ...rows[0], hg: rows[0].hg + 1, src: 'conflicting-provider.csv' };

  assert.throws(
    () => mergeRows(existing, [changed]),
    /Conflicting full-time scores.*stored.*incoming.*No import was saved/
  );
  // The stored input is immutable; a rejected merge cannot mutate the prior dataset.
  assert.equal(existing[0].hg, rows[0].hg);
  assert.equal(existing.length, rows.length);
});

test('zip: reads csv entries, skips junk/legacy files with a reason', async () => {
  const zip = zipSync({
    'data/E0_2526.csv': strToU8(csv(SEASON)),
    '__MACOSX/data/._E0_2526.csv': strToU8('junk'),
    'readme.pdf': strToU8('x'),
    'old/E1.xls': strToU8('x'),
  });
  const res = await importFromBuffer('history.zip', zip);
  assert.equal(res.rows.length, 10);
  const reasons = res.skippedEntries.map(s => `${s.name}:${s.reason}`).join(' | ');
  assert.match(reasons, /readme\.pdf/);
  assert.match(reasons, /legacy \.xls/);
  assert.ok(!reasons.includes('__MACOSX'));
});

test('zip: oversized entry is refused before inflation (zip-bomb guard)', async () => {
  const big = new Uint8Array(101 * 1024 * 1024); // compresses to ~100KB
  const zip = zipSync({ 'bomb.csv': big }, { level: 1 });
  const res = await importFromBuffer('bomb.zip', zip);
  assert.equal(res.rows.length, 0);
  assert.match(res.skippedEntries[0].reason, /too large/);
});

test('zip: garbage bytes give a clear error', async () => {
  await assert.rejects(() => importFromBuffer('x.zip', strToU8('definitely not a zip')), /Could not read zip/);
});

test('xlsx: a minimal workbook is read like a csv', async () => {
  const cell = (ref: string, v: string | number) =>
    typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
  const data = [
    ['Date', 'HomeTeam', 'AwayTeam', 'FTHG', 'FTAG'],
    ['2025-08-01', 'Alpha', 'Beta', 2, 0],
    ['2025-08-02', 'Gamma', 'Delta', 1, 1],
  ];
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${
    data.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => cell(String.fromCharCode(65 + j) + (i + 1), v)).join('')}</row>`).join('')
  }</sheetData></worksheet>`;
  const xlsx = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  });
  const res = await importFromBuffer('book.xlsx', xlsx);
  assert.equal(res.rows.length, 2);
  assert.equal(res.rows[0].home, 'Alpha');
  assert.equal(res.rows[0].hg, 2);
});

// ---------- Rule 2 (prior-season pedigree) and Rule 3 (home fortress / elite away) inputs ----------

/** Double round-robin of 8 teams (T0 strongest): 14 rounds/season, deterministic results, one season per year. */
function league8(seasonStartYear: number, opts: { skipTeam?: string } = {}): ImportedMatchRow[] {
  const rows: ImportedMatchRow[] = [];
  const n = 8;
  let day = Date.UTC(seasonStartYear, 7, 1);
  let round = 0;
  for (const leg of [0, 1]) {
    for (let r = 0; r < n - 1; r++) {
      for (let m = 0; m < n / 2; m++) {
        const a = m === 0 ? 0 : ((r + m) % (n - 1)) + 1;
        const b = ((r + n - 1 - m) % (n - 1)) + 1;
        const [h, aw] = leg === 0 ? [a, b] : [b, a];
        if (opts.skipTeam && (`T${h}` === opts.skipTeam || `T${aw}` === opts.skipTeam)) continue;
        const d = new Date(day).toISOString().slice(0, 10);
        const hg = h < aw ? 2 : 0, ag = h < aw ? 0 : 1; // lower index always wins; home side wins when stronger
        rows.push({
          key: `L|${d}|T${h}|T${aw}`, date: d, league: 'L', home: `T${h}`, away: `T${aw}`, hg, ag,
          season: `${seasonStartYear}`, src: 't.csv',
        });
      }
      day += 7 * 86_400_000;
      round++;
    }
  }
  void round;
  return rows;
}

test('prior-season pedigree: last season\'s final rank/points carry into the next season, tagged HISTORICAL_IMPORT', () => {
  const { results } = buildTrainingSet([...league8(2024), ...league8(2025)]);
  const s2 = results.filter(r => r.date >= '2025-08-01');
  const t0 = s2.find(r => r.fixture.homeTeam.name === 'T0')!.fixture.homeTeam;
  assert.equal(t0.lastSeasonRank, 1);
  assert.equal(t0.lastSeasonStanding, '1st (Champions)');
  assert.equal(t0.advancedStatsSource, 'HISTORICAL_IMPORT');
  const t7 = s2.find(r => r.fixture.awayTeam.name === 'T7')!.fixture.awayTeam;
  assert.equal(t7.lastSeasonRank, 8);
  assert.equal(t7.lastSeasonStanding, '8th');
  // first season has no prior season at all
  assert.equal(results.find(r => r.date < '2025-01-01')!.fixture.homeTeam.lastSeasonRank, undefined);
});

test('pedigree is never invented: partial prior season, missing season, or a team absent last year all give nothing', () => {
  // partial prior season (T7 never plays) -> min played < 80% of max -> not a final table
  const partial = buildTrainingSet([...league8(2024, { skipTeam: 'T7' }).slice(0, 40), ...league8(2025)]).results;
  assert.equal(partial.find(r => r.date >= '2025-08-01')!.fixture.homeTeam.lastSeasonRank, undefined);
  // a whole season missing in between (2023 then 2025) -> no carry-over
  const gap = buildTrainingSet([...league8(2023), ...league8(2025)]).results;
  assert.equal(gap.find(r => r.date >= '2025-08-01')!.fixture.homeTeam.lastSeasonRank, undefined);
  // a team that did not play last season (promoted) is left unset, not given a made-up rank
  const promoted = buildTrainingSet([...league8(2024, { skipTeam: 'T7' }), ...league8(2025)]).results;
  const newcomer = promoted.find(r => r.date >= '2025-08-01' && r.fixture.homeTeam.name === 'T7')!.fixture.homeTeam;
  assert.equal(newcomer.lastSeasonRank, undefined);
});

test('pedigree ranks above 20 are not emitted (engine would misread them as "newly promoted")', () => {
  const rows: ImportedMatchRow[] = [];
  const mk = (season: string, d: string, h: number, a: number, hg: number, ag: number) =>
    rows.push({ key: `B|${season}|${d}|${h}|${a}`, date: d, league: 'B', home: `X${h}`, away: `X${a}`, hg, ag, season, src: 'x' });
  // 24-team league, each team plays 4 games last season so the table is "complete"; X23 finishes last.
  for (let g = 0; g < 4; g++) for (let i = 0; i < 24; i += 2) {
    const d = new Date(Date.UTC(2024, 8, 1 + g * 7)).toISOString().slice(0, 10);
    mk('2024', d, i, i + 1, i + 1 < 24 ? 2 : 0, 0); // even index wins -> odd indices lose, X23 last-ish
  }
  mk('2025', '2025-09-01', 1, 3, 1, 0);
  const t = buildTrainingSet(rows).results.find(r => r.date === '2025-09-01')!.fixture.homeTeam;
  assert.ok(t.lastSeasonRank === undefined || t.lastSeasonRank <= 20);
});

test('Rule 3 flags mirror the live providers: >=3 home/away games, last 5, ppg >= 2.0', () => {
  const { results } = buildTrainingSet(league8(2024));
  // T0 is at home in the first half of the season (after 3 home games it is "home dominant") and away in the second.
  const homeCase = results.find(r => r.date >= '2024-08-22' && r.fixture.homeTeam.name === 'T0')!.fixture.homeTeam;
  assert.equal(homeCase.isHomeDominant, true);
  assert.equal(homeCase.homeAwayFormSource, 'HISTORICAL_IMPORT');
  const awayCase = results.find(r => r.date >= '2024-10-10' && r.fixture.awayTeam.name === 'T0')!.fixture.awayTeam;
  assert.equal(awayCase.hasTopTierAwayForm, true); // wins every away game so far
  // the weakest side, once it has a sample, is neither
  const weak = results.filter(r => r.date >= '2024-10-10' && r.fixture.homeTeam.name === 'T7').map(r => r.fixture.homeTeam)[0];
  if (weak) { assert.equal(weak.isHomeDominant, false); assert.equal(weak.hasTopTierAwayForm, false); }
  // too early: no sample, so no source is claimed and flags stay false
  const first = results[0].fixture.homeTeam;
  assert.equal(first.homeAwayFormSource, undefined);
  assert.equal(first.isHomeDominant, false);
});

test('Rule 2/3 inputs are still strictly point-in-time (mutating a later season never changes an earlier match)', () => {
  const base = buildTrainingSet([...league8(2024), ...league8(2025)]).results;
  const mutated = [...league8(2024), ...league8(2025)].map(r => (r.date >= '2025-10-01' ? { ...r, hg: 9, ag: 0 } : r));
  const alt = buildTrainingSet(mutated).results;
  for (let i = 0; i < base.length; i++) {
    if (base[i].date < '2025-10-01') assert.deepEqual(alt[i].fixture, base[i].fixture, `leak at ${base[i].date}`);
  }
});

test('Country + League files (extra-leagues layout) keep leagues distinct; Season column is read; odds PH/PD/PA ignored', () => {
  const table = [
    ['Country', 'League', 'Season', 'Date', 'Time', 'Home', 'Away', 'HG', 'AG', 'Res', 'PH', 'PD', 'PA', 'MaxH'],
    ['Brazil', 'Serie A', '2023', '15/04/2023', '16:00', 'Flamengo RJ', 'Santos', '2', '1', 'H', '1.5', '4', '6', '1.6'],
    ['Argentina', 'Liga Profesional', '2023', '16/04/2023', '18:00', 'River Plate', 'Boca Juniors', '1', '1', 'D', '2.1', '3', '3.5', '2.2'],
  ];
  const { rows, report } = tableToRows(table, 'BRA.csv');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].league, 'Brazil • Serie A');
  assert.equal(rows[1].league, 'Argentina • Liga Profesional');
  assert.equal(rows[0].season, '2023');
  assert.ok(report.oddsColumnsIgnored.includes('PH') && report.oddsColumnsIgnored.includes('MaxH'));
  assert.ok(!JSON.stringify(rows).includes('1.5'), 'odds must not leak into stored rows');
});

test('Windows-1252 files (accented team names) decode correctly instead of turning into mojibake', async () => {
  const text = 'Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR\nSP1,15/08/2024,Atlético Madrid,Málaga,2,1,H\n';
  const latin1 = Uint8Array.from([...text].map(c => c.charCodeAt(0))); // single-byte, invalid as UTF-8
  const res = await importFromBuffer('SP1.csv', latin1);
  assert.equal(res.rows[0].home, 'Atlético Madrid');
  assert.equal(res.rows[0].away, 'Málaga');
});

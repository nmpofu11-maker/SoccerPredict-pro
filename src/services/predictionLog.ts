/**
 * Prediction log: an append-only, hash-chained record of predictions made BEFORE kickoff,
 * plus the real outcomes recorded afterwards. It exists so accuracy can be measured on
 * matches the engine had never seen, instead of on data it was tuned on.
 *
 * Design rules
 *  - Append only. This module never rewrites or deletes the log file (see the source-level test).
 *  - A prediction is accepted only if it is written strictly before kickoff, once per fixture.
 *  - An outcome is accepted only for an existing prediction, once, and only at/after kickoff.
 *  - Every line carries the hash of the previous line, so edits, deletions and reordering are
 *    detectable with verifyLog(). This is tamper-EVIDENT, not tamper-proof: someone who can
 *    rewrite the whole file can rebuild the chain, so record headHash somewhere outside the server.
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

export type Outcome = 'home' | 'draw' | 'away';

export interface PredictionRecord {
  type: 'prediction';
  fixtureId: string;
  kickoffTime: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  frozenAt: string;
  probabilities: { home: number; draw: number; away: number }; // percent, sums to ~100
  predicted: Outcome;
  modelVersion: string;
  inputCoverage: number; // 0..1, share of the 10 team-level inputs that were actually available
}

export interface OutcomeRecord {
  type: 'outcome';
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  actual: Outcome;
  recordedAt: string;
}

export type LogBody = PredictionRecord | OutcomeRecord;
export type LogLine = LogBody & { seq: number; prevHash: string; hash: string };

export const GENESIS_HASH = '0'.repeat(64);

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function lineHash(withoutHash: Record<string, unknown>): string {
  return sha256(JSON.stringify(withoutHash));
}

/** Read every line. Unparseable lines are reported instead of silently skipped. */
export function readLog(file: string): { lines: LogLine[]; unparseable: number } {
  if (!fs.existsSync(file)) return { lines: [], unparseable: 0 };
  const raw = fs.readFileSync(file, 'utf-8');
  const lines: LogLine[] = [];
  let unparseable = 0;
  for (const text of raw.split('\n')) {
    if (!text.trim()) continue;
    try {
      lines.push(JSON.parse(text) as LogLine);
    } catch {
      unparseable++;
    }
  }
  return { lines, unparseable };
}

export interface VerifyResult {
  ok: boolean;
  count: number;
  headHash: string;
  brokenAtSeq: number | null;
  reason: string | null;
}

/** Recompute the chain. Any edited, removed, reordered or malformed line makes ok=false. */
export function verifyLog(file: string): VerifyResult {
  const { lines, unparseable } = readLog(file);
  if (unparseable > 0) {
    return { ok: false, count: lines.length, headHash: GENESIS_HASH, brokenAtSeq: null, reason: `${unparseable} unparseable line(s)` };
  }
  let prev = GENESIS_HASH;
  for (let i = 0; i < lines.length; i++) {
    const { hash, ...rest } = lines[i] as any;
    if (rest.seq !== i + 1) return { ok: false, count: lines.length, headHash: prev, brokenAtSeq: i + 1, reason: 'sequence gap or reorder' };
    if (rest.prevHash !== prev) return { ok: false, count: lines.length, headHash: prev, brokenAtSeq: i + 1, reason: 'prevHash mismatch' };
    if (lineHash(rest) !== hash) return { ok: false, count: lines.length, headHash: prev, brokenAtSeq: i + 1, reason: 'content hash mismatch' };
    prev = hash;
  }
  return { ok: true, count: lines.length, headHash: prev, brokenAtSeq: null, reason: null };
}

function appendBody(file: string, body: LogBody): LogLine {
  const { lines } = readLog(file);
  const prevHash = lines.length ? lines[lines.length - 1].hash : GENESIS_HASH;
  const withoutHash = { ...body, seq: lines.length + 1, prevHash };
  const line = { ...withoutHash, hash: lineHash(withoutHash) } as LogLine;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(line) + '\n', 'utf-8');
  return line;
}

export type AppendStatus = 'appended' | 'duplicate' | 'late' | 'early' | 'invalid' | 'no_prediction';

const isOutcome = (v: unknown): v is Outcome => v === 'home' || v === 'draw' || v === 'away';

export function outcomeFromScores(home: number, away: number): Outcome {
  return home > away ? 'home' : home < away ? 'away' : 'draw';
}

/** Freeze a prediction. `now` is injectable so tests control the clock. */
export function appendPrediction(
  file: string,
  input: Omit<PredictionRecord, 'type' | 'frozenAt'>,
  now: number = Date.now()
): { status: AppendStatus; detail?: string } {
  const kickoff = Date.parse(input.kickoffTime);
  if (!input.fixtureId || !Number.isFinite(kickoff)) return { status: 'invalid', detail: 'missing fixtureId or unparseable kickoff' };
  const p = input.probabilities;
  const vals = [p?.home, p?.draw, p?.away];
  if (vals.some((v) => !Number.isFinite(v) || (v as number) < 0) || Math.abs((vals as number[]).reduce((a, b) => a + b, 0) - 100) > 1.5) {
    return { status: 'invalid', detail: 'probabilities must be non-negative and sum to about 100' };
  }
  if (!isOutcome(input.predicted)) return { status: 'invalid', detail: 'predicted must be home, draw or away' };
  if (!(now < kickoff)) return { status: 'late', detail: 'kickoff has already passed' };

  const { lines } = readLog(file);
  if (lines.some((l) => l.type === 'prediction' && l.fixtureId === input.fixtureId)) return { status: 'duplicate' };

  appendBody(file, { ...input, type: 'prediction', frozenAt: new Date(now).toISOString() });
  return { status: 'appended' };
}

/** Record the real result for an already-logged prediction. */
export function appendOutcome(
  file: string,
  input: { fixtureId: string; homeScore: number; awayScore: number },
  now: number = Date.now()
): { status: AppendStatus; detail?: string } {
  const { homeScore, awayScore } = input;
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
    return { status: 'invalid', detail: 'scores must be non-negative integers' };
  }
  const { lines } = readLog(file);
  const pred = lines.find((l) => l.type === 'prediction' && l.fixtureId === input.fixtureId) as (PredictionRecord & LogLine) | undefined;
  if (!pred) return { status: 'no_prediction' };
  if (lines.some((l) => l.type === 'outcome' && l.fixtureId === input.fixtureId)) return { status: 'duplicate' };
  if (now < Date.parse(pred.kickoffTime)) return { status: 'early', detail: 'outcome recorded before kickoff' };

  appendBody(file, {
    type: 'outcome',
    fixtureId: input.fixtureId,
    homeScore,
    awayScore,
    actual: outcomeFromScores(homeScore, awayScore),
    recordedAt: new Date(now).toISOString(),
  });
  return { status: 'appended' };
}

/** Share of the 10 team-level inputs (rank, points, possession, shots on target, form x 2 teams) that are present. */
export function computeInputCoverage(fixture: any): number {
  let have = 0;
  for (const t of [fixture?.homeTeam, fixture?.awayTeam]) {
    if (Number.isFinite(t?.leagueRank)) have++;
    if (Number.isFinite(t?.points)) have++;
    if (Number.isFinite(t?.avgPossession)) have++;
    if (Number.isFinite(t?.avgShotsOnTarget)) have++;
    if (Array.isArray(t?.form) && t.form.length > 0) have++;
  }
  return have / 10;
}

/** 95% Wilson score interval for a proportion. */
export function wilsonInterval(correct: number, n: number): { low: number; high: number } | null {
  if (n <= 0) return null;
  const z = 1.96;
  const p = correct / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

export interface MetricBlock {
  n: number;
  reportable: boolean; // false until n >= minSample; the numbers below are then null
  accuracyPct: number | null;
  accuracy95CiPct: { low: number; high: number } | null;
  brier: number | null; // multiclass Brier score: sum of squared errors over the 3 outcomes, range 0..2
  alwaysHomeAccuracyPct: number | null;
  mostCommonOutcomeAccuracyPct: number | null; // chosen with hindsight, so it flatters the baseline
  uniformGuessBrier: number; // 2/3: what predicting 1/3-1/3-1/3 every time scores
}

export interface TrackRecord {
  minSample: number;
  predictionsLogged: number;
  scored: number;
  pending: number;
  excludedNotFrozenBeforeKickoff: number;
  overall: MetricBlock;
  fullInputCoverageOnly: MetricBlock;
  generatedAt: string;
}

interface Scored {
  pred: PredictionRecord;
  actual: Outcome;
}

function metrics(rows: Scored[], minSample: number): MetricBlock {
  const n = rows.length;
  const base: MetricBlock = {
    n,
    reportable: n >= minSample,
    accuracyPct: null,
    accuracy95CiPct: null,
    brier: null,
    alwaysHomeAccuracyPct: null,
    mostCommonOutcomeAccuracyPct: null,
    uniformGuessBrier: 2 / 3,
  };
  if (n < minSample) return base;

  let correct = 0;
  let brier = 0;
  const counts: Record<Outcome, number> = { home: 0, draw: 0, away: 0 };
  for (const { pred, actual } of rows) {
    if (pred.predicted === actual) correct++;
    counts[actual]++;
    const o = { home: actual === 'home' ? 1 : 0, draw: actual === 'draw' ? 1 : 0, away: actual === 'away' ? 1 : 0 };
    brier +=
      (pred.probabilities.home / 100 - o.home) ** 2 +
      (pred.probabilities.draw / 100 - o.draw) ** 2 +
      (pred.probabilities.away / 100 - o.away) ** 2;
  }
  const ci = wilsonInterval(correct, n)!;
  return {
    ...base,
    accuracyPct: (100 * correct) / n,
    accuracy95CiPct: { low: 100 * ci.low, high: 100 * ci.high },
    brier: brier / n,
    alwaysHomeAccuracyPct: (100 * counts.home) / n,
    mostCommonOutcomeAccuracyPct: (100 * Math.max(counts.home, counts.draw, counts.away)) / n,
  };
}

/**
 * Score logged predictions against logged outcomes. Predictions whose freeze time is not strictly
 * before kickoff are excluded even if they somehow reached the file.
 */
export function summarize(lines: LogLine[], minSample = 30, now: number = Date.now()): TrackRecord {
  const outcomes = new Map<string, OutcomeRecord>();
  for (const l of lines) if (l.type === 'outcome' && !outcomes.has(l.fixtureId)) outcomes.set(l.fixtureId, l);

  const preds = lines.filter((l): l is PredictionRecord & LogLine => l.type === 'prediction');
  let excluded = 0;
  const scoredRows: Scored[] = [];
  const coverageFull: Scored[] = [];
  let pending = 0;

  for (const pred of preds) {
    if (!(Date.parse(pred.frozenAt) < Date.parse(pred.kickoffTime))) {
      excluded++;
      continue;
    }
    const out = outcomes.get(pred.fixtureId);
    if (!out) {
      pending++;
      continue;
    }
    const row = { pred, actual: out.actual };
    scoredRows.push(row);
    if (pred.inputCoverage === 1) coverageFull.push(row);
  }

  return {
    minSample,
    predictionsLogged: preds.length,
    scored: scoredRows.length,
    pending,
    excludedNotFrozenBeforeKickoff: excluded,
    overall: metrics(scoredRows, minSample),
    fullInputCoverageOnly: metrics(coverageFull, minSample),
    generatedAt: new Date(now).toISOString(),
  };
}

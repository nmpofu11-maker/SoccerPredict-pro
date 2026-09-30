/**
 * Prints the out-of-sample track record from the prediction log.
 *   npm run track-record            (uses PREDICTION_LOG_PATH or data/prediction-log.jsonl)
 */
import path from 'path';
import { readLog, summarize, verifyLog } from '../src/services/predictionLog';

const file = process.env.PREDICTION_LOG_PATH?.trim() || path.join(process.cwd(), 'data', 'prediction-log.jsonl');
const minSample = Math.max(1, Number(process.env.PREDICTION_MIN_SAMPLE || 30));
const v = verifyLog(file);
const r = summarize(readLog(file).lines, minSample);
const pct = (x: number | null) => (x === null ? 'n/a' : `${x.toFixed(1)}%`);

console.log(`Log: ${file}`);
console.log(`Integrity: ${v.ok ? 'OK' : `BROKEN (${v.reason}${v.brokenAtSeq ? ` at line ${v.brokenAtSeq}` : ''})`}  entries=${v.count}`);
console.log(`Head hash (note this somewhere outside the server): ${v.headHash}`);
console.log(`Predictions logged: ${r.predictionsLogged} | scored: ${r.scored} | pending: ${r.pending} | excluded (not frozen before kickoff): ${r.excludedNotFrozenBeforeKickoff}`);
const show = (label: string, m: typeof r.overall) => {
  if (!m.reportable) return console.log(`${label}: n=${m.n} - not reportable until ${r.minSample} scored predictions`);
  console.log(`${label}: n=${m.n}`);
  console.log(`  accuracy ${pct(m.accuracyPct)} (95% CI ${pct(m.accuracy95CiPct!.low)} to ${pct(m.accuracy95CiPct!.high)})`);
  console.log(`  baselines: always-home ${pct(m.alwaysHomeAccuracyPct)}, most-common-outcome ${pct(m.mostCommonOutcomeAccuracyPct)} (hindsight)`);
  console.log(`  Brier (sum over 3 outcomes, lower is better): ${m.brier!.toFixed(3)} vs ${m.uniformGuessBrier.toFixed(3)} for always guessing 1/3 each`);
};
show('All scored', r.overall);
show('Full input coverage only', r.fullInputCoverageOnly);
if (!v.ok) process.exitCode = 1;

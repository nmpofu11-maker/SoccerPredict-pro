import React, { useEffect, useRef, useState } from 'react';
import { getAdminApiHeaders } from '../services/adminAuthService';
import { saveLearningState } from '../engine/selfLearningEngine';
import type { EngineWeights, LearningModelState } from '../types/soccer';

interface Props {
  learningState: LearningModelState;
  onUpdateLearningState: (s: LearningModelState) => void;
}

interface ImportFailureDetails {
  files?: { file: string; rowsAccepted: number; rowsSkipped: number; skipReasons?: Record<string, number>; note?: string }[];
  skippedEntries?: { name: string; reason: string }[];
}

interface ImportResult {
  rowsParsed: number;
  added: number;
  duplicatesIgnored: number;
  storedTotal: number;
  training: { usable: number; leagues: number; dateFrom: string | null; dateTo: string | null; totalRows: number };
  oddsColumnsIgnored: string[];
  files: { file: string; rowsAccepted: number; rowsSkipped: number; skipReasons: Record<string, number>; note?: string }[];
  skippedEntries: { name: string; reason: string }[];
}

interface TrainResult {
  ok: boolean;
  reason?: string;
  usableMatches: number;
  trainedOn: number;
  holdoutSize: number;
  epochs: number;
  proposedWeights?: EngineWeights;
  before?: { accuracyPct: number; brierLoss: number };
  after?: { accuracyPct: number; brierLoss: number };
  baselines?: { alwaysMostCommonOutcome: { outcome: string; accuracyPct: number; brierLoss: number } };
  improvedOnHoldout?: boolean;
  note: string;
}

interface SportApiHistorySyncResult {
  provider: string;
  fromDate: string;
  toDate: string;
  daysRequested: number;
  daysFetched: number;
  fixturesSeen: number;
  completedFixtures: number;
  completedWithoutUsableScore: number;
  importedRows: number;
  added: number;
  duplicatesIgnored: number;
  storedTotal: number;
  training: { usable: number; totalRows: number; leagues: number; dateFrom?: string | null; dateTo?: string | null };
  note?: string;
  error?: string;
  stoppedAt?: string;
}

interface StoredSummary {
  storedTotal: number;
  training: {
    usable: number;
    totalRows: number;
    leagues: number;
    dateFrom?: string | null;
    dateTo?: string | null;
  };
  storage: {
    pathConfigured: boolean;
    persistenceVerified: boolean;
    note: string;
  };
}

async function readJson(res: Response): Promise<any> {
  try { return await res.json(); } catch { return { error: `Server returned HTTP ${res.status}` }; }
}

async function fetchStoredSummary(): Promise<StoredSummary | null> {
  try {
    const res = await fetch('/api/admin/historical/summary', { headers: getAdminApiHeaders() });
    if (!res.ok) return null;
    return await res.json() as StoredSummary;
  } catch {
    return null;
  }
}

export const HistoricalImportPanel: React.FC<Props> = ({ learningState, onUpdateLearningState }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'import' | 'train' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importFailureDetails, setImportFailureDetails] = useState<ImportFailureDetails | null>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [trained, setTrained] = useState<TrainResult | null>(null);
  const [maxMatches, setMaxMatches] = useState<number>(5_000);
  const [applied, setApplied] = useState(false);
  const [historyFromDate, setHistoryFromDate] = useState(() => new Date(Date.now() - 364 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [historyToDate, setHistoryToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [historySync, setHistorySync] = useState<SportApiHistorySyncResult | null>(null);
  const [storedSummary, setStoredSummary] = useState<StoredSummary | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchStoredSummary().then(summary => { if (alive && summary) setStoredSummary(summary); });
    return () => { alive = false; };
  }, []);

  const syncSportApiHistory = async () => {
    setBusy('import'); setError(null); setImportFailureDetails(null); setHistorySync(null); setImported(null); setTrained(null); setApplied(false);
    try {
      const res = await fetch('/api/admin/historical/sportapi-ai/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminApiHeaders() },
        body: JSON.stringify({ fromDate: historyFromDate, toDate: historyToDate }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || `Historical sync failed (HTTP ${res.status})`);
      setHistorySync(data as SportApiHistorySyncResult);
      void fetchStoredSummary().then(summary => { if (summary) setStoredSummary(summary); });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import historical results from SportAPI.ai');
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File) => {
    setBusy('import'); setError(null); setImportFailureDetails(null); setHistorySync(null); setTrained(null); setApplied(false);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/historical/import', { method: 'POST', headers: getAdminApiHeaders(), body: fd });
      const data = await readJson(res);
      if (!res.ok) {
        if (Array.isArray(data.files) || Array.isArray(data.skippedEntries)) {
          setImportFailureDetails({
            files: Array.isArray(data.files) ? data.files : [],
            skippedEntries: Array.isArray(data.skippedEntries) ? data.skippedEntries : [],
          });
        }
        throw new Error(data.error || 'Import failed');
      }
      setImportFailureDetails(null);
      setImported(data);
      void fetchStoredSummary().then(summary => { if (summary) setStoredSummary(summary); });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const train = async () => {
    setBusy('train'); setError(null); setTrained(null); setApplied(false);
    try {
      const res = await fetch('/api/admin/historical/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminApiHeaders() },
        body: JSON.stringify({ weights: learningState.weights, maxMatches }),
      });
      const data = await readJson(res);
      if (!res.ok && !data.reason) throw new Error(data.error || 'Training failed');
      if (!data.ok) setError(data.reason || 'Training could not run');
      setTrained(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Training failed');
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!trained?.ok || !trained.proposedWeights || !trained.after) return;
    const next: LearningModelState = {
      ...learningState,
      weights: trained.proposedWeights,
      accuracyPct: trained.after.accuracyPct,
      brierLoss: trained.after.brierLoss,
      totalEpochsTrained: learningState.totalEpochsTrained + trained.epochs,
      lastTrainedAt: new Date().toISOString(),
    };
    setError(null);
    try {
      // Save to the SERVER first and check the answer. saveLearningState() alone fires and forgets, so a server
      // refusal would leave the weights only in this browser while the screen claimed success.
      const res = await fetch('/api/learning-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminApiHeaders() },
        body: JSON.stringify({ state: next }),
      });
      if (!res.ok) {
        const d = await readJson(res);
        if (res.status === 409) {
          throw new Error('The server refused to save these weights because training writes are switched off. Add ALLOW_LEARNING_TRAINING=1 to your .env file, restart the app, then train and apply again. Nothing was changed.');
        }
        if (res.status === 401 || res.status === 503) {
          throw new Error(d.message || 'Admin key missing or wrong. Enter the same ADMIN_API_KEY you put in .env. Nothing was changed.');
        }
        throw new Error(d.message || d.error || `Server refused to save the weights (HTTP ${res.status}). Nothing was changed.`);
      }
      saveLearningState(next); // keep this browser's copy in step
      onUpdateLearningState(next);
      setApplied(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply weights');
    }
  };

  const clearAll = async () => {
    if (!window.confirm('Delete ALL imported historical matches from the server? This cannot be undone.')) return;
    setBusy('import'); setError(null);
    try {
      const res = await fetch('/api/admin/historical', { method: 'DELETE', headers: getAdminApiHeaders() });
      if (!res.ok) throw new Error((await readJson(res)).error || 'Could not clear data');
      setImported(null); setHistorySync(null); setTrained(null);
      void fetchStoredSummary().then(summary => { if (summary) setStoredSummary(summary); });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear data');
    } finally {
      setBusy(null);
    }
  };

  const beatsBaseline = trained?.ok && trained.after && trained.baselines
    ? trained.after.brierLoss < trained.baselines.alwaysMostCommonOutcome.brierLoss
    : false;

  return (
    <div className="p-5 rounded-xl border border-sky-500/30 bg-slate-900 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-sky-300">Train on historical results (CSV / XLSX / ZIP or provider sync)</h3>
        <p className="text-xs text-slate-400 mt-1">
          Needs date, home team, away team and full-time goals. Rank, points, form and head-to-head are computed from the
          files themselves using only earlier matches. Bookmaker odds columns are ignored and never stored.
          The full archive stays stored; each training run fits the selected most-recent window (up to 30,000 matches).
        </p>
      </div>
      {storedSummary && (
        <div className="rounded border border-slate-700 bg-slate-950/50 p-3 space-y-1 text-xs text-slate-300">
          <div>
            <strong>Server historical store:</strong> {storedSummary.storedTotal.toLocaleString()} matches; {storedSummary.training.usable.toLocaleString()} currently usable for training across {storedSummary.training.leagues} league(s).
            {storedSummary.training.dateFrom && storedSummary.training.dateTo ? ` Date range: ${storedSummary.training.dateFrom} → ${storedSummary.training.dateTo}.` : ''}
          </div>
          <div className="text-amber-300">Persistence not independently verified. {storedSummary.storage.note}</div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <label className="flex items-center gap-2 text-xs text-slate-300">
          Training window
          <select value={maxMatches} onChange={e => setMaxMatches(Number(e.target.value))} disabled={busy !== null}
            className="bg-slate-950 border border-slate-600 rounded px-2 py-1">
            <option value={5000}>5,000 (fast)</option>
            <option value={10000}>10,000</option>
            <option value={20000}>20,000</option>
            <option value={30000}>30,000 (maximum)</option>
          </select>
        </label>
        <input ref={fileRef} type="file" accept=".zip,.csv,.xlsx" disabled={busy !== null}
          onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }}
          className="text-xs text-slate-300 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-sky-600 file:text-white" />
        <button onClick={train} disabled={busy !== null}
          className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold">
          {busy === 'train' ? 'Training… other requests may be delayed' : 'Run training on imported data'}
        </button>
        <button onClick={clearAll} disabled={busy !== null}
          className="px-3 py-1.5 rounded border border-red-500/40 text-red-300 hover:bg-red-950/40 disabled:opacity-50 text-xs">
          Clear imported data
        </button>
        {busy === 'import' && <span className="text-xs text-slate-400">Working…</span>}
      </div>

      <div className="text-[11px] text-amber-300">
        Only the selected recent window is used to fit weights; older imported results remain available for point-in-time history/features.
        The most recent 20% of the selected window is held out from fitting for evaluation.
      </div>

      <div className="rounded border border-slate-700 p-3 space-y-3">
        <div className="text-xs font-semibold text-slate-200">Import historical completed results from SportAPI.ai</div>
        <p className="text-[11px] text-slate-400">
          Uses the configured authenticated API key, not an automated public-archive scraper. One API request is made per calendar day.
          Choose up to 365 days per run; provider coverage and plan limits apply. Only completed matches with valid full-time scores are stored.
        </p>
        <div className="flex flex-wrap items-end gap-2 text-xs text-slate-300">
          <label className="flex flex-col gap-1">Start date
            <input type="date" value={historyFromDate} max={historyToDate}
              onChange={e => setHistoryFromDate(e.target.value)} disabled={busy !== null}
              className="bg-slate-950 border border-slate-600 rounded px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1">End date
            <input type="date" value={historyToDate} min={historyFromDate} max={new Date().toISOString().slice(0, 10)}
              onChange={e => setHistoryToDate(e.target.value)} disabled={busy !== null}
              className="bg-slate-950 border border-slate-600 rounded px-2 py-1" />
          </label>
          <button onClick={syncSportApiHistory} disabled={busy !== null || !historyFromDate || !historyToDate || historyFromDate > historyToDate}
            className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold">
            {busy === 'import' ? 'Importing historical results…' : 'Import completed results'}
          </button>
        </div>
        <div className="text-[11px] text-slate-500">The last 12 months are selected initially. Requests are sequential to respect API quotas.</div>
        {busy === 'import' && <div className="text-xs text-amber-300">Import may take a little while. Keep this page open until the result summary appears.</div>}
        {historySync && (
          <div className="text-xs text-slate-300 space-y-1">
            <div>
              Queried <b>{historySync.daysFetched.toLocaleString()}</b> of {historySync.daysRequested.toLocaleString()} dates;
              saw {historySync.fixturesSeen.toLocaleString()} fixtures and {historySync.completedFixtures.toLocaleString()} marked completed.
            </div>
            <div>
              Imported {historySync.importedRows.toLocaleString()} usable completed results; added <b>{historySync.added.toLocaleString()}</b>
              ({historySync.duplicatesIgnored.toLocaleString()} duplicates ignored).
              The server now stores {historySync.storedTotal.toLocaleString()} matches; {historySync.training.usable.toLocaleString()}
              {' '}of {historySync.training.totalRows.toLocaleString()} are usable for training across {historySync.training.leagues} league(s).
            </div>
            {historySync.stoppedAt && <div className="text-amber-300">Stopped at {historySync.stoppedAt}.</div>}
            {historySync.note && <div className="text-amber-300">{historySync.note}</div>}
            {historySync.error && <div className="text-red-300">Provider error: {historySync.error}</div>}
          </div>
        )}
      </div>

      {error && <div className="text-xs text-red-300 bg-red-950/40 border border-red-500/30 rounded p-2">{error}</div>}
      {importFailureDetails && (
        <div className="rounded border border-amber-500/40 bg-amber-950/20 p-3 text-xs text-slate-300 space-y-2">
          <div className="font-semibold text-amber-200">Import diagnostics — no history was added by this failed upload.</div>
          {(importFailureDetails.files ?? []).length > 0 && (
            <div>
              <div className="font-semibold text-slate-200">Files read</div>
              <ul className="list-disc pl-4 mt-1 space-y-1">
                {(importFailureDetails.files ?? []).slice(0, 50).map((f, index) => (
                  <li key={`${f.file}-${index}`}>
                    <strong>{f.file}</strong>: accepted {f.rowsAccepted}, skipped {f.rowsSkipped}
                    {f.note ? ` — ${f.note}` : ''}
                    {f.skipReasons && Object.keys(f.skipReasons).length > 0
                      ? `; reasons: ${Object.entries(f.skipReasons).map(([reason, count]) => `${reason}=${count}`).join(', ')}`
                      : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(importFailureDetails.skippedEntries ?? []).length > 0 && (
            <div>
              <div className="font-semibold text-slate-200">Files skipped</div>
              <ul className="list-disc pl-4 mt-1 space-y-1">
                {(importFailureDetails.skippedEntries ?? []).slice(0, 50).map((entry, index) => (
                  <li key={`${entry.name}-${index}`}>{entry.name}: {entry.reason}</li>
                ))}
              </ul>
            </div>
          )}
          {(importFailureDetails.files ?? []).length === 0 && (importFailureDetails.skippedEntries ?? []).length === 0 && (
            <div>The server could not extract a supported CSV/XLSX results table. Upload a .csv, .xlsx, or ZIP containing those files.</div>
          )}
          <div>Expected columns include Date, HomeTeam, AwayTeam, FTHG and FTAG. Rows need a valid match date and numeric full-time scores. Legacy .xls files must be resaved as .xlsx or CSV.</div>
        </div>
      )}

      {imported && (
        <div className="text-xs text-slate-300 space-y-1 bg-slate-950/60 rounded p-3 border border-slate-700">
          <div>
            Added <b>{imported.added.toLocaleString()}</b> matches
            {imported.duplicatesIgnored > 0 && <> ({imported.duplicatesIgnored.toLocaleString()} duplicates ignored)</>};
            {' '}<b>{imported.storedTotal.toLocaleString()}</b> stored across {imported.training.leagues} league(s),
            {' '}{imported.training.dateFrom} → {imported.training.dateTo}.
          </div>
          <div>
            <b>{imported.training.usable.toLocaleString()}</b> of {imported.training.totalRows.toLocaleString()} have enough prior
            history to be used for training (a team's first few games of its history cannot be used).
          </div>
          {imported.oddsColumnsIgnored.length > 0 && (
            <div className="text-emerald-300">Ignored odds columns: {imported.oddsColumnsIgnored.join(', ')}</div>
          )}
          {imported.files.some(f => f.rowsSkipped > 0 || f.note) && (
            <details className="text-slate-400">
              <summary className="cursor-pointer">Skipped rows / notes</summary>
              <ul className="mt-1 list-disc pl-4">
                {imported.files.filter(f => f.rowsSkipped > 0 || f.note).slice(0, 50).map(f => (
                  <li key={f.file}>{f.file}: {f.rowsSkipped} skipped {Object.entries(f.skipReasons).map(([k, v]) => `${k}=${v}`).join(', ')} {f.note || ''}</li>
                ))}
              </ul>
            </details>
          )}
          {imported.skippedEntries.length > 0 && (
            <details className="text-slate-400">
              <summary className="cursor-pointer">{imported.skippedEntries.length} zip entries skipped</summary>
              <ul className="mt-1 list-disc pl-4">
                {imported.skippedEntries.slice(0, 50).map(s => <li key={s.name}>{s.name}: {s.reason}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {trained?.ok && trained.before && trained.after && trained.baselines && (
        <div className="text-xs text-slate-300 space-y-2 bg-slate-950/60 rounded p-3 border border-slate-700">
          <div className="font-semibold text-slate-200">
            Result on {trained.holdoutSize.toLocaleString()} unseen recent matches (fit on {trained.trainedOn.toLocaleString()}, {trained.epochs} epochs)
          </div>
          <table className="w-full text-left">
            <thead className="text-slate-500"><tr><th>Model</th><th>Accuracy</th><th>Brier (lower is better)</th></tr></thead>
            <tbody>
              <tr><td>Current weights</td><td>{trained.before.accuracyPct}%</td><td>{trained.before.brierLoss}</td></tr>
              <tr><td>Proposed weights</td><td>{trained.after.accuracyPct}%</td><td>{trained.after.brierLoss}</td></tr>
              <tr className="text-slate-400"><td>Baseline: training frequencies (most common: "{trained.baselines.alwaysMostCommonOutcome.outcome}")</td>
                <td>{trained.baselines.alwaysMostCommonOutcome.accuracyPct}%</td><td>{trained.baselines.alwaysMostCommonOutcome.brierLoss}</td></tr>
            </tbody>
          </table>
          {!trained.improvedOnHoldout && (
            <div className="text-amber-300">Training did not improve the unseen holdout. Applying these weights is not recommended.</div>
          )}
          {trained.improvedOnHoldout && !beatsBaseline && (
            <div className="text-amber-300">Improved, but still not better than the no-knowledge baseline on Brier score.</div>
          )}
          <div className="text-slate-500">{trained.note}</div>
          <button onClick={() => void apply()} disabled={applied || !trained.improvedOnHoldout || !beatsBaseline}
            title={!trained.improvedOnHoldout ? 'Cannot apply: the proposal did not improve holdout performance.' : !beatsBaseline ? 'Cannot apply: the proposal did not beat the no-knowledge baseline on Brier score.' : undefined}
            className={`px-3 py-1.5 rounded text-white text-xs font-semibold disabled:opacity-50 ${beatsBaseline && trained.improvedOnHoldout ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-600 cursor-not-allowed'}`}>
            {applied ? 'Applied' : beatsBaseline && trained.improvedOnHoldout ? 'Apply verified improvement' : 'Apply blocked — validation failed'}
          </button>
        </div>
      )}
    </div>
  );
};

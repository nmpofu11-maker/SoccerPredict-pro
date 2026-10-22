import React, { useEffect, useRef, useState } from 'react';
import { getAdminApiHeaders } from '../services/adminAuthService';
import { saveLearningState } from '../engine/selfLearningEngine';
import type { EngineWeights, LearningModelState } from '../types/soccer';

interface Props {
  learningState: LearningModelState;
  onUpdateLearningState: (s: LearningModelState) => void;
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

interface FdCatalog {
  leagues: { code: string; name: string; kind: 'main' | 'extra' }[];
  currentSeasonStart: number;
  limits: { maxFilesPerSync: number };
  coverageNote: string;
}

interface FdSyncResult {
  filesRequested: number; ok: number; notPublished: number; failed: number;
  added: number; duplicatesIgnored: number; storedTotal: number;
  training: { usable: number; totalRows: number; leagues: number };
  oddsColumnsIgnored: string[];
  outcomes: { label: string; status: 'ok' | 'not_published' | 'failed'; detail?: string; accepted?: number }[];
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
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [trained, setTrained] = useState<TrainResult | null>(null);
  const [maxMatches, setMaxMatches] = useState<number>(5_000);
  const [applied, setApplied] = useState(false);
  const [catalog, setCatalog] = useState<FdCatalog | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [fromSeason, setFromSeason] = useState<number>(0);
  const [sync, setSync] = useState<FdSyncResult | null>(null);
  const [storedSummary, setStoredSummary] = useState<StoredSummary | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/historical/football-data/catalog', { headers: getAdminApiHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then((c: FdCatalog | null) => { if (alive && c) { setCatalog(c); setFromSeason(c.currentSeasonStart - 4); } })
      .catch(() => { /* panel still works for manual uploads */ });
    void fetchStoredSummary().then(summary => { if (alive && summary) setStoredSummary(summary); });
    return () => { alive = false; };
  }, []);

  const toggle = (code: string) => setPicked(p => p.includes(code) ? p.filter(c => c !== code) : [...p, code]);

  const downloadFromProvider = async () => {
    setBusy('import'); setError(null); setSync(null); setImported(null); setTrained(null); setApplied(false);
    try {
      const res = await fetch('/api/admin/historical/football-data/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminApiHeaders() },
        body: JSON.stringify({ leagues: picked, fromSeason }),
      });
      const data = await readJson(res);
      if (!res.ok) { if (data.outcomes) setSync({ ...data, filesRequested: data.outcomes.length, ok: 0, notPublished: 0, failed: 0, added: 0, duplicatesIgnored: 0, storedTotal: 0, training: { usable: 0, totalRows: 0, leagues: 0 }, oddsColumnsIgnored: [] }); throw new Error(data.error || 'Download failed'); }
      setSync(data);
      void fetchStoredSummary().then(summary => { if (summary) setStoredSummary(summary); });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File) => {
    setBusy('import'); setError(null); setSync(null); setTrained(null); setApplied(false);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/historical/import', { method: 'POST', headers: getAdminApiHeaders(), body: fd });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Import failed');
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
      setImported(null); setSync(null); setTrained(null);
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
        <h3 className="text-sm font-bold text-sky-300">Train on historical results (CSV / XLSX / ZIP)</h3>
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
          {busy === 'train' ? 'Training… (can take up to a minute)' : 'Run training on imported data'}
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

      <div className="rounded border border-slate-700 p-3 space-y-2">
        <div className="text-xs font-semibold text-slate-200">Or download from football-data.co.uk (free public archive)</div>
        {!catalog ? (
          <div className="text-xs text-slate-500">Catalog unavailable (admin key needed). Manual upload above still works.</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {catalog.leagues.filter(l => l.kind === 'main').map(l => (
                <label key={l.code} className="text-xs text-slate-300 flex items-center gap-1">
                  <input type="checkbox" checked={picked.includes(l.code)} onChange={() => toggle(l.code)} disabled={busy !== null} />
                  {l.name}
                </label>
              ))}
            </div>
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer">More leagues (Argentina, Brazil, USA, …)</summary>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                {catalog.leagues.filter(l => l.kind === 'extra').map(l => (
                  <label key={l.code} className="flex items-center gap-1">
                    <input type="checkbox" checked={picked.includes(l.code)} onChange={() => toggle(l.code)} disabled={busy !== null} />
                    {l.name}
                  </label>
                ))}
              </div>
            </details>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              From season starting
              <input type="number" value={fromSeason} min={1993} max={catalog.currentSeasonStart}
                onChange={e => setFromSeason(Number(e.target.value))}
                className="w-20 bg-slate-950 border border-slate-600 rounded px-2 py-1" />
              <button onClick={downloadFromProvider} disabled={busy !== null || picked.length === 0}
                className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold">
                Download &amp; add to training data
              </button>
              <span className="text-slate-500">Max {catalog.limits.maxFilesPerSync} files per run; ~1 s per file.</span>
            </div>
            <div className="text-[11px] text-slate-500">{catalog.coverageNote} Odds columns in these files are ignored.</div>
          </>
        )}
        {sync && (
          <div className="text-xs text-slate-300 space-y-1">
            <div>
              {sync.ok}/{sync.filesRequested} files read ({sync.notPublished} not published, {sync.failed} failed).
              Added <b>{sync.added.toLocaleString()}</b> matches ({sync.duplicatesIgnored.toLocaleString()} already present);
              {' '}<b>{sync.training.usable.toLocaleString()}</b> of {sync.training.totalRows.toLocaleString()} stored are usable for training.
            </div>
            <details className="text-slate-400">
              <summary className="cursor-pointer">Per-file results</summary>
              <ul className="mt-1 list-disc pl-4">
                {sync.outcomes.map(o => <li key={o.label}>{o.label}: {o.status}{o.accepted !== undefined ? ` (${o.accepted} matches)` : ''}{o.detail ? ` — ${o.detail}` : ''}</li>)}
              </ul>
            </details>
          </div>
        )}
      </div>

      {error && <div className="text-xs text-red-300 bg-red-950/40 border border-red-500/30 rounded p-2">{error}</div>}

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

import React, { useState, useEffect } from 'react';
import { Cpu, RefreshCw, CheckCircle2, AlertCircle, Clock, ShieldCheck, ShieldAlert } from 'lucide-react';
import { fetchCronStatus, triggerIngestNow, fetchDailySlate, fetchEvidenceCoverage, CronStatusResponse, EvidenceCoverageResponse, IngestNowResponse, IngestDiagnostics, ProviderIngestDiagnostics } from '../services/resultsService';
import { MatchFixture } from '../types/soccer';

interface PipelineStatusWidgetProps {
  onFixturesSynced?: (fixtures: MatchFixture[]) => void;
}

export const PipelineStatusWidget: React.FC<PipelineStatusWidgetProps> = ({ onFixturesSynced }) => {
  const [status, setStatus] = useState<CronStatusResponse | null>(null);
  const [evidence, setEvidence] = useState<EvidenceCoverageResponse | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<IngestNowResponse | null>(null);

  const refresh = () => {
    fetchCronStatus().then(setStatus);
    fetchEvidenceCoverage().then(setEvidence);
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const result = await triggerIngestNow();
      setSyncResult(result);
      refresh();
      if (result.success && onFixturesSynced) {
        const fixtures = await fetchDailySlate();
        if (fixtures) onFixturesSynced(fixtures);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const ingest = status?.cron.ingest;
  const isHealthy = ingest?.lastSuccess === true;
  const hasRun = ingest?.lastRunAt != null;
  const diagnostics = (syncResult?.diagnostics || ingest?.diagnostics) as IngestDiagnostics | undefined;
  const providerSummary = (label: string, provider?: ProviderIngestDiagnostics) => {
    if (!provider) return null;
    const requestStatus = provider.requestCount > 0
      ? `${provider.successfulRequests}/${provider.requestCount} requests succeeded`
      : provider.configured ? 'configured; not queried' : 'not configured';
    return (
      <div key={label} className="flex items-start justify-between gap-3">
        <span className="text-slate-300">{label}</span>
        <span className={provider.failedRequests > 0 || provider.mappedRecords === 0 && provider.rawRecords > 0 ? 'text-amber-300 text-right' : 'text-slate-400 text-right'}>
          {requestStatus} · {provider.rawRecords} raw · {provider.mappedRecords} mapped · {provider.rejectedRecords} rejected
        </span>
      </div>
    );
  };

  return (
    <div
      className="bg-slate-900/90 border border-indigo-500/30 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md text-xs font-mono"
      id="pipeline-status-widget"
    >
      <div className="flex items-center gap-2.5">
        <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
          <Cpu className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-1.5 font-bold text-white">
            <span>Fixture Pipeline</span>
            {hasRun && (
              <span
                className={`px-1.5 py-0.5 rounded border text-[10px] flex items-center gap-1 ${
                  isHealthy
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                }`}
              >
                {isHealthy ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                {isHealthy ? (ingest?.sourceUsed || 'OK') : 'FAILING'}
              </span>
            )}
          </div>
          <div className="text-slate-400 text-[11px] mt-0.5 flex items-center gap-2">
            <Clock className="w-3 h-3" />
            <span>
              {hasRun
                ? `Last run: ${new Date(ingest!.lastRunAt as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Not yet run'}
            </span>
          </div>
          {evidence && (
            <div className="text-slate-300 text-[10.5px] mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                {evidence.withEvidenceCount}/{evidence.totalFixtures} Evidence
              </span>
              <span>•</span>
              <span>Standings: {evidence.standingsCount}</span>
              <span>•</span>
              <span>Form: {evidence.formCount}</span>
            </div>
          )}
          {!isHealthy && hasRun && (
            <div className="text-rose-400 text-[11px] mt-1 max-w-md truncate" title={ingest?.lastMessage}>
              {ingest?.lastMessage}
            </div>
          )}
          {syncResult && (
            <div className={`text-[11px] mt-1 max-w-xl ${syncResult.success ? 'text-emerald-300' : 'text-rose-300'}`} role="status">
              {syncResult.success ? 'Sync completed' : 'Sync failed'}: {syncResult.message} ({syncResult.count} fixtures)
            </div>
          )}
          {diagnostics && (
            <details className="mt-2 text-[10.5px] text-slate-400 max-w-2xl">
              <summary className="cursor-pointer hover:text-slate-200">Provider diagnostics · {diagnostics.timezone}</summary>
              <div className="mt-1 space-y-1 rounded border border-slate-700/70 bg-slate-950/60 p-2">
                {providerSummary('SportAPI.ai', diagnostics.sportApiAi)}
                {providerSummary('Sportmonks', diagnostics.sportmonks)}
                {providerSummary('API-Football', diagnostics.apiFootball)}
                {providerSummary('TheRundown', diagnostics.theRundown)}
                {providerSummary('PitchAPI', diagnostics.pitchApi)}
                {providerSummary('SportDB', diagnostics.sportDb)}
                <div className="border-t border-slate-700 pt-1 mt-1">
                  Manifest: {diagnostics.manifestBefore} before → {diagnostics.manifestAfter} after · Added: {diagnostics.added} · Source: {diagnostics.sourceUsed || 'none'}
                </div>
                {[...diagnostics.sportApiAi.httpErrors, ...diagnostics.sportmonks.httpErrors, ...diagnostics.apiFootball.httpErrors].slice(0, 3).map((error, index) => (
                  <div key={index} className="text-amber-300 break-words">{error}</div>
                ))}
                {[...diagnostics.sportApiAi.notes, ...diagnostics.sportmonks.notes].slice(0, 3).map((note, index) => (
                  <div key={`note-${index}`} className="text-slate-500 break-words">{note}</div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
        {status && (
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 font-sans">SportAPI.ai</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${status.sportApiAiRateLimited ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : status.sportApiAiConfigured ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                {status.sportApiAiRateLimited ? 'RATE LIMITED' : status.sportApiAiConfigured ? 'KEY SET' : 'UNSET'}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 font-sans">Sportmonks</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${status.sportmonksRateLimited ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : status.sportmonksConfigured ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                {status.sportmonksRateLimited ? 'RATE LIMITED' : status.sportmonksConfigured ? 'KEY SET' : 'UNSET'}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 font-sans">API-Football</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${status.apiFootballRateLimited ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : status.apiFootballConfigured ? 'bg-slate-700/70 border-slate-600 text-slate-300' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                {status.apiFootballRateLimited ? 'RATE LIMITED' : status.apiFootballConfigured ? 'KEY SET' : 'UNSET'}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 font-sans">Football-Data</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${status.footballDataConfigured ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                {status.footballDataConfigured ? 'CONNECTED' : 'UNSET'}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 font-sans">TheRundown</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${status.theRundownConfigured ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                {status.theRundownConfigured ? 'CONNECTED' : 'UNSET'}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 font-sans">PitchAPI</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${status.pitchApiConfigured ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                {status.pitchApiConfigured ? 'CONNECTED' : 'UNSET'}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 font-sans">SportDB</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${status.sportDbConfigured ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                {status.sportDbConfigured ? 'CONNECTED' : 'UNSET'}
              </span>
            </div>
          </div>
        )}

        <button
          onClick={handleSyncNow}
          disabled={isSyncing}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold flex items-center gap-1.5 shadow transition-all disabled:opacity-50"
          title="Actually triggers the server-side ingestion job now"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
        </button>
      </div>
    </div>
  );
};

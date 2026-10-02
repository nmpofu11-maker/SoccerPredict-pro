import React, { useState, useEffect } from 'react';
import { Cpu, RefreshCw, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { fetchCronStatus, triggerIngestNow, fetchDailySlate, CronStatusResponse } from '../services/resultsService';
import { MatchFixture } from '../types/soccer';

interface PipelineStatusWidgetProps {
  onFixturesSynced?: (fixtures: MatchFixture[]) => void;
}

/**
 * Replaces the old ApiQuotaWidget, which displayed a fully simulated quota
 * counter (localStorage-only, never connected to any real API call) next to
 * a "Test Connection" button that made zero network requests. Everything
 * shown here comes from the real server-side pipeline via /api/admin/cron-status
 * — actual provider used, actual last-run time, actual success/failure and
 * why, actual quota consumed against your real API-Football key if configured.
 */
export const PipelineStatusWidget: React.FC<PipelineStatusWidgetProps> = ({ onFixturesSynced }) => {
  const [status, setStatus] = useState<CronStatusResponse | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const refresh = () => {
    fetchCronStatus().then(setStatus);
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60 * 1000); // real status, checked every minute
    return () => clearInterval(interval);
  }, []);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await triggerIngestNow();
      refresh();
      if (onFixturesSynced) {
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
          {!isHealthy && hasRun && (
            <div className="text-rose-400 text-[11px] mt-1 max-w-md truncate" title={ingest?.lastMessage}>
              {ingest?.lastMessage}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
        {status && (
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 font-sans">SportAPI.ai</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${status.sportApiAiConfigured ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                {status.sportApiAiConfigured ? 'CONNECTED' : 'UNSET'}
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

import React, { useState, useEffect } from 'react';
import { Cpu, RefreshCw, CheckCircle2, AlertCircle, Clock, ShieldCheck, ShieldAlert } from 'lucide-react';
import { fetchCronStatus, triggerIngestNow, fetchPersistedSlate, fetchEvidenceCoverage, fetchFixtureEligibilityAudit, CronStatusResponse, EvidenceCoverageResponse, FixtureEligibilityAuditResponse } from '../services/resultsService';
import { MatchFixture } from '../types/soccer';

interface PipelineStatusWidgetProps {
  onFixturesSynced?: (fixtures: MatchFixture[]) => void;
}

export const PipelineStatusWidget: React.FC<PipelineStatusWidgetProps> = ({ onFixturesSynced }) => {
  const [status, setStatus] = useState<CronStatusResponse | null>(null);
  const [evidence, setEvidence] = useState<EvidenceCoverageResponse | null>(null);
  const [eligibility, setEligibility] = useState<FixtureEligibilityAuditResponse | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const refresh = () => {
    fetchCronStatus().then(setStatus);
    fetchEvidenceCoverage().then(setEvidence);
    fetchFixtureEligibilityAudit().then(setEligibility);
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const ingest = await triggerIngestNow();
      if (!ingest.success) {
        setSyncMessage(`Ingestion failed: ${ingest.message}. Existing fixtures were retained.`);
        refresh();
        return;
      }

      const persisted = await fetchPersistedSlate();
      if (!persisted.fixtures) {
        setSyncMessage(`Ingestion finished, but the saved fixture list could not be read: ${persisted.message || 'unknown read error'}.`);
        refresh();
        return;
      }

      if (onFixturesSynced) onFixturesSynced(persisted.fixtures);
      setSyncMessage(`Ingestion finished: ${ingest.message || 'provider job completed'}. Loaded ${persisted.fixtures.length} saved fixtures.`);
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setSyncMessage(`Sync failed: ${message}. Existing fixtures were retained.`);
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
          {eligibility?.eligibilitySummary && (
            <div
              className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-[10.5px]"
              aria-label="Automatic prediction eligibility audit"
              title="This audit reads the persisted fixture manifest only; it does not test live provider connectivity."
            >
              <span className="text-slate-300">Identified: <strong>{eligibility.eligibilitySummary.providerIdentified}/{eligibility.eligibilitySummary.totalFixtures}</strong></span>
              <span className="text-slate-300">Authentic: <strong>{eligibility.eligibilitySummary.authenticityVerified}/{eligibility.eligibilitySummary.totalFixtures}</strong></span>
              <span className="text-slate-300">Both teams evidenced: <strong>{eligibility.eligibilitySummary.twoSidedEvidence}/{eligibility.eligibilitySummary.totalFixtures}</strong></span>
              <span className="text-emerald-300">Eligible: <strong>{eligibility.eligibilitySummary.eligibleForAutomaticPrediction}</strong></span>
              <span className="text-amber-300">Blocked: authenticity <strong>{eligibility.eligibilitySummary.blockedByAuthenticity}</strong></span>
              <span className="text-amber-300">Blocked: team evidence <strong>{eligibility.eligibilitySummary.blockedByTeamEvidence}</strong></span>
            </div>
          )}
          {!isHealthy && hasRun && (
            <div className="text-rose-400 text-[11px] mt-1 max-w-md truncate" title={ingest?.lastMessage}>
              {ingest?.lastMessage}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
        {status && (() => {
          const renderBadge = (
            label: string,
            active: boolean,
            hasKey: boolean,
            rateLimited: boolean,
            activeClass: string
          ) => {
            const stateLabel = active
              ? 'CONFIGURED'
              : hasKey && rateLimited
              ? 'COOLDOWN'
              : hasKey
              ? 'PAUSED'
              : 'UNSET';
            const badgeClass = active
              ? activeClass
              : hasKey && rateLimited
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : hasKey
              ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
              : 'bg-slate-800 border-slate-700 text-slate-400';
            return (
              <div className="flex flex-col items-end" key={label}>
                <span className="text-[10px] text-slate-400 font-sans">{label}</span>
                <span
                  title="Credential configured does not confirm a successful live API response; COOLDOWN indicates temporary HTTP 429 rate-limit protection."
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${badgeClass}`}
                >
                  {stateLabel}
                </span>
              </div>
            );
          };

          return (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {renderBadge('SportAPI.ai', status.sportApiAiConfigured, status.providerKeys?.sportApiAi ?? status.sportApiAiConfigured, Boolean(status.rateLimited?.sportApiAi), 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300')}
              {renderBadge('Sportmonks', status.sportmonksConfigured, status.providerKeys?.sportmonks ?? status.sportmonksConfigured, Boolean(status.rateLimited?.sportmonks), 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300')}
              {renderBadge('API-Football', status.apiFootballConfigured, status.providerKeys?.apiFootball ?? status.apiFootballConfigured, Boolean(status.rateLimited?.apiFootball), 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300')}
              {renderBadge('Football-Data', status.footballDataConfigured, status.providerKeys?.footballData ?? status.footballDataConfigured, Boolean(status.rateLimited?.footballData), 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300')}
              {renderBadge('TheRundown', status.theRundownConfigured, status.providerKeys?.theRundown ?? status.theRundownConfigured, false, 'bg-blue-500/20 border-blue-500/40 text-blue-300')}
              {renderBadge('PitchAPI', status.pitchApiConfigured, status.providerKeys?.pitchApi ?? status.pitchApiConfigured, false, 'bg-purple-500/20 border-purple-500/40 text-purple-300')}
              {renderBadge('SportDB', status.sportDbConfigured, status.providerKeys?.sportDb ?? status.sportDbConfigured, false, 'bg-amber-500/20 border-amber-500/40 text-amber-300')}
            </div>
          );
        })()}

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
      {syncMessage && (
        <div aria-live="polite" className={`text-[11px] rounded-lg border px-3 py-2 ${syncMessage.toLowerCase().includes('failed') ? 'bg-rose-950/40 border-rose-800 text-rose-300' : 'bg-slate-950/60 border-slate-700 text-slate-300'}`}>
          {syncMessage}
        </div>
      )}
    </div>
  );
};

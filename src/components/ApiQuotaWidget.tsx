import React, { useState, useEffect } from 'react';
import { loadApiQuotaState, ApiQuotaState } from '../services/apiQuotaGuardService';
import { performSmartBatchSync } from '../services/apiSchedulerService';
import { ShieldCheck, Zap, Database, RefreshCw, Cpu, Key, Clock } from 'lucide-react';
import { ApiKeySettingsModal } from './ApiKeySettingsModal';
import { MatchFixture } from '../types/soccer';

interface ApiQuotaWidgetProps {
  onFixturesSynced?: (fixtures: MatchFixture[]) => void;
}

export const ApiQuotaWidget: React.FC<ApiQuotaWidgetProps> = ({ onFixturesSynced }) => {
  const [quotaState, setQuotaState] = useState<ApiQuotaState>(() => loadApiQuotaState());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncInfo, setLastSyncInfo] = useState<string>('Auto-synced (6h interval)');

  useEffect(() => {
    // Run automated batch sync on initial mount in background
    performSmartBatchSync(false).then((res) => {
      if (res.fixtures && res.fixtures.length > 0 && onFixturesSynced) {
        onFixturesSynced(res.fixtures);
      }
      setLastSyncInfo(`Source: ${res.status.source.toUpperCase()} (${new Date(res.status.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
      setQuotaState(loadApiQuotaState());
    }).catch(() => {});

    const interval = setInterval(() => {
      setQuotaState(loadApiQuotaState());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const res = await performSmartBatchSync(true);
      if (res.fixtures && res.fixtures.length > 0 && onFixturesSynced) {
        onFixturesSynced(res.fixtures);
      }
      setLastSyncInfo(`Synced Now (${res.status.source.toUpperCase()})`);
      setQuotaState(loadApiQuotaState());
    } catch (e) {
      console.warn('Manual sync failed', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const percentageUsed = Math.min(100, Math.round((quotaState.callsUsed / quotaState.maxDailyLimit) * 100));

  return (
    <>
      <div className="bg-slate-900/90 border border-indigo-500/30 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md text-xs font-mono" id="api-quota-widget">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 font-bold text-white">
              <span>Verified API Guard</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px]">
                100 Calls/Day Max
              </span>
            </div>
            <div className="text-slate-400 text-[11px] mt-0.5 flex items-center gap-2">
              <span className="flex items-center gap-1 text-indigo-300">
                <Clock className="w-3 h-3" /> {lastSyncInfo}
              </span>
              <span>•</span>
              <span className="text-emerald-400">Exhaustion Impossible</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
          <div className="text-right hidden xs:block">
            <div className="text-slate-400 text-[10px] uppercase">Daily Quota Used</div>
            <div className="text-sm font-black text-indigo-300">
              {quotaState.callsUsed} / {quotaState.maxDailyLimit} <span className="text-xs font-normal text-slate-400">({percentageUsed}%)</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold flex items-center gap-1.5 shadow transition-all disabled:opacity-50"
              title="Batch sync now (respects 6h cache & 100 limit)"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Batch'}</span>
            </button>

            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center gap-1.5 shadow transition-all"
            >
              <Key className="w-3.5 h-3.5" />
              <span>API Key</span>
            </button>
          </div>
        </div>
      </div>

      <ApiKeySettingsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};

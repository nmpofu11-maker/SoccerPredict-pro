import { LearningModelState } from '../types/soccer';
import { loadManualOverrides, clearAllManualOverrides } from './storage';

export interface StorageMetrics {
  isPersistent: boolean;
  usageBytes: number;
  quotaBytes: number;
  percentUsed: number;
  hasServerSync: boolean;
  lastSyncedAt: string | null;
  backupsCount: number;
}

export interface BackupMetadata {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export interface FullExportBundle {
  version: string;
  exportedAt: string;
  type: 'SOCCER_PREDICTION_ENGINE_LEARNED_BACKUP';
  learningState: LearningModelState;
  manualOverrides: Record<string, string>;
  appMetadata: {
    totalLeagues: number;
    ruleSetVersion: string;
  };
}

let lastServerSyncTimestamp: string | null = null;
let isSyncing = false;

/**
 * Requests the browser or Android WebView to mark client storage as persistent,
 * preventing Android from evicting local data when storage is low.
 */
export async function ensurePersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persist();
      return isPersisted;
    }
  } catch (err) {
    console.warn('Persistent storage request failed:', err);
  }
  return false;
}

/**
 * Retrieves client storage performance telemetry (quota, memory, persistence)
 */
export async function getStoragePerformanceMetrics(): Promise<StorageMetrics> {
  let isPersistent = false;
  let usageBytes = 0;
  let quotaBytes = 0;
  let percentUsed = 0;

  try {
    if (typeof navigator !== 'undefined' && navigator.storage) {
      if (navigator.storage.persisted) {
        isPersistent = await navigator.storage.persisted();
      }
      if (navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        usageBytes = est.usage || 0;
        quotaBytes = est.quota || 0;
        if (quotaBytes > 0) {
          percentUsed = Math.round((usageBytes / quotaBytes) * 100);
        }
      }
    }
  } catch (err) {
    console.warn('Could not estimate storage:', err);
  }

  let backupsCount = 0;
  try {
    const backups = await listServerBackups();
    backupsCount = backups.length;
  } catch {
    // ignore
  }

  return {
    isPersistent,
    usageBytes,
    quotaBytes,
    percentUsed,
    hasServerSync: lastServerSyncTimestamp !== null,
    lastSyncedAt: lastServerSyncTimestamp,
    backupsCount,
  };
}

/**
 * Persists the learning state to the durable backend storage
 */
export async function syncLearningStateToServer(state: LearningModelState): Promise<boolean> {
  if (isSyncing) return false;
  isSyncing = true;
  try {
    const res = await fetch('/api/learning-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });
    if (res.ok) {
      lastServerSyncTimestamp = new Date().toISOString();
      isSyncing = false;
      return true;
    }
  } catch (err) {
    console.warn('Could not sync learning state to server API (running offline or in client mode):', err);
  } finally {
    isSyncing = false;
  }
  return false;
}

/**
 * Attempts to load learning state from the server disk storage
 */
export async function fetchServerLearningState(): Promise<LearningModelState | null> {
  try {
    const res = await fetch('/api/learning-state');
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'ok' && data.state) {
        lastServerSyncTimestamp = new Date().toISOString();
        return data.state as LearningModelState;
      }
    }
  } catch (err) {
    console.warn('Could not fetch server learning state:', err);
  }
  return null;
}

/**
 * Creates a timestamped server-side snapshot backup
 */
export async function createServerBackup(state: LearningModelState, tag?: string): Promise<string | null> {
  try {
    const res = await fetch('/api/learning-state/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, tag }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.filename || 'backup.json';
    }
  } catch (err) {
    console.error('Failed to create server backup:', err);
  }
  return null;
}

/**
 * Lists all available backup snapshots
 */
export async function listServerBackups(): Promise<BackupMetadata[]> {
  try {
    const res = await fetch('/api/learning-state/backups');
    if (res.ok) {
      const data = await res.json();
      return data.backups || [];
    }
  } catch (err) {
    console.warn('Failed to list server backups:', err);
  }
  return [];
}

/**
 * Restores a specific server backup
 */
export async function restoreServerBackup(filename: string): Promise<LearningModelState | null> {
  try {
    const res = await fetch('/api/learning-state/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.state as LearningModelState;
    }
  } catch (err) {
    console.error('Failed to restore server backup:', err);
  }
  return null;
}

/**
 * Exports full model state and manual overrides to a downloadable JSON file
 */
export function exportFullLearnedDataToFile(state: LearningModelState): void {
  const overrides = loadManualOverrides();
  const bundle: FullExportBundle = {
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    type: 'SOCCER_PREDICTION_ENGINE_LEARNED_BACKUP',
    learningState: state,
    manualOverrides: overrides,
    appMetadata: {
      totalLeagues: 46,
      ruleSetVersion: '8-Rule Quantitative Calibration v2',
    },
  };

  const jsonStr = JSON.stringify(bundle, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `soccer_predictor_learned_model_${dateStr}_epoch_${state.totalEpochsTrained}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Imports and validates a JSON backup file uploaded by the user
 */
export async function importLearnedDataFromFile(
  file: File
): Promise<{ success: boolean; state?: LearningModelState; message: string }> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    let state: LearningModelState | null = null;
    if (data.type === 'SOCCER_PREDICTION_ENGINE_LEARNED_BACKUP' && data.learningState) {
      state = data.learningState;
      if (data.manualOverrides) {
        try {
          localStorage.setItem('soccer_engine_manual_overrides_v1', JSON.stringify(data.manualOverrides));
        } catch {
          // ignore
        }
      }
    } else if (data.weights && typeof data.weights.tacticalShotsWeight === 'number') {
      state = data as LearningModelState;
    }

    if (!state || !state.weights) {
      return {
        success: false,
        message: 'Invalid file format: Could not find valid model weights in the uploaded file.',
      };
    }

    // Persist to server as well
    syncLearningStateToServer(state);

    return {
      success: true,
      state,
      message: `Successfully restored model state (${state.totalEpochsTrained} epochs, ${state.accuracyPct}% accuracy).`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'File parsing error';
    return {
      success: false,
      message: `Failed to import backup: ${msg}`,
    };
  }
}

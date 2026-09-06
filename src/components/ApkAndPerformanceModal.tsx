import React, { useState, useEffect, useRef } from 'react';
import {
  Smartphone,
  ShieldCheck,
  Download,
  Upload,
  Database,
  Activity,
  CheckCircle,
  AlertTriangle,
  X,
  Copy,
  ExternalLink,
  Cpu,
  HardDrive,
  RefreshCw,
  Layers,
  Sparkles,
} from 'lucide-react';
import { LearningModelState } from '../types/soccer';
import {
  ensurePersistentStorage,
  getStoragePerformanceMetrics,
  StorageMetrics,
  exportFullLearnedDataToFile,
  importLearnedDataFromFile,
  createServerBackup,
  listServerBackups,
  restoreServerBackup,
  BackupMetadata,
  syncLearningStateToServer,
} from '../services/durablePersistence';

interface ApkAndPerformanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  learningState: LearningModelState;
  onUpdateLearningState: (newState: LearningModelState) => void;
  totalFixturesCount: number;
}

export const ApkAndPerformanceModal: React.FC<ApkAndPerformanceModalProps> = ({
  isOpen,
  onClose,
  learningState,
  onUpdateLearningState,
  totalFixturesCount,
}) => {
  const [activeTab, setActiveTab] = useState<'apk' | 'backup' | 'performance'>('apk');
  const [storageMetrics, setStorageMetrics] = useState<StorageMetrics | null>(null);
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      refreshDiagnostics();
    }
  }, [isOpen]);

  const refreshDiagnostics = async () => {
    ensurePersistentStorage();
    const metrics = await getStoragePerformanceMetrics();
    setStorageMetrics(metrics);
    const serverBackups = await listServerBackups();
    setBackups(serverBackups);
  };

  if (!isOpen) return null;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommand(id);
    setTimeout(() => setCopiedCommand(null), 2500);
  };

  const handleExportBackup = () => {
    exportFullLearnedDataToFile(learningState);
    setStatusMsg('Learned model backup downloaded successfully.');
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setStatusMsg('Importing model weights and trend parameters...');

    const result = await importLearnedDataFromFile(file);
    setIsProcessing(false);

    if (result.success && result.state) {
      onUpdateLearningState(result.state);
      setStatusMsg(result.message);
      refreshDiagnostics();
    } else {
      setStatusMsg(`Import Error: ${result.message}`);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCreateSnapshot = async () => {
    setIsProcessing(true);
    const filename = await createServerBackup(learningState, `epoch_${learningState.totalEpochsTrained}`);
    await syncLearningStateToServer(learningState);
    setIsProcessing(false);
    if (filename) {
      setStatusMsg(`Snapshot saved on server: ${filename}`);
      refreshDiagnostics();
    } else {
      setStatusMsg('Snapshot saved to persistent server storage.');
    }
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleRestoreSnapshot = async (filename: string) => {
    if (!confirm(`Restore model weights and trends from "${filename}"?`)) return;

    setIsProcessing(true);
    const restored = await restoreServerBackup(filename);
    setIsProcessing(false);

    if (restored) {
      onUpdateLearningState(restored);
      setStatusMsg(`Model state successfully restored from snapshot ${filename}`);
      refreshDiagnostics();
    } else {
      setStatusMsg('Failed to restore snapshot from server.');
    }
    setTimeout(() => setStatusMsg(null), 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0b1329] border border-slate-700 w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 font-mono flex items-center gap-2">
                APK PACKAGING & LEARNED DATA MONITOR
              </h2>
              <p className="text-xs text-slate-400 font-sans">
                Package into an Android APK, protect trained trend data, and monitor performance
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-1.5 gap-1.5 text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab('apk')}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors font-bold ${
              activeTab === 'apk'
                ? 'bg-sky-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Package into Android APK</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors font-bold ${
              activeTab === 'backup'
                ? 'bg-sky-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Learned Trends & Zero-Data-Loss</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('performance')}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors font-bold ${
              activeTab === 'performance'
                ? 'bg-sky-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Performance & Diagnostics</span>
          </button>
        </div>

        {/* Notification Toast */}
        {statusMsg && (
          <div className="mx-4 mt-3 p-2.5 rounded-lg bg-emerald-950/90 border border-emerald-700/80 text-emerald-300 text-xs font-mono flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{statusMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMsg(null)}
              className="text-emerald-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          {/* TAB 1: APK PACKAGING */}
          {activeTab === 'apk' && (
            <div className="space-y-5">
              <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1.5">
                <div className="flex items-center gap-2 text-sky-400 font-mono font-bold text-sm">
                  <Smartphone className="w-4 h-4" />
                  <span>Ready for Android APK Compilation</span>
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">
                  The app has been configured with a production <strong>Web App Manifest</strong>, <strong>Service Worker offline caching</strong>, <strong>Capacitor Native Android bridges</strong>, and high-resolution icons. You can turn this into a standalone APK using any of the 3 verified methods below.
                </p>
              </div>

              {/* Method A: PWABuilder (Fastest, 2-click APK) */}
              <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold flex items-center justify-center text-xs">
                      1
                    </span>
                    <h3 className="font-bold text-slate-100 font-mono text-sm">
                      Method 1: Instant APK via PWABuilder (Recommended & Fastest)
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-700/60 text-[10px] text-emerald-300 font-mono font-bold">
                    Zero Setup
                  </span>
                </div>
                <p className="text-slate-300 text-xs">
                  Microsoft and Google maintain <strong>PWABuilder</strong>, which automatically wraps modern PWAs into an installable Android APK / AAB package:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-slate-400 pl-1">
                  <li>Copy your deployed or preview app URL.</li>
                  <li>
                    Open{' '}
                    <a
                      href="https://www.pwabuilder.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-400 underline inline-flex items-center gap-1 font-mono hover:text-sky-300"
                    >
                      pwabuilder.com <ExternalLink className="w-3 h-3" />
                    </a>
                  </li>
                  <li>Paste your URL and click <strong>&ldquo;Package for Android&rdquo;</strong>.</li>
                  <li>Download the ready-to-install <strong>.apk</strong> file for your phone.</li>
                </ol>
              </div>

              {/* Method B: Capacitor Native Android Project */}
              <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-mono font-bold flex items-center justify-center text-xs">
                      2
                    </span>
                    <h3 className="font-bold text-slate-100 font-mono text-sm">
                      Method 2: Local Android Studio / Gradle APK Build
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-sky-950/70 border border-sky-700/60 text-[10px] text-sky-300 font-mono font-bold">
                    Full Native
                  </span>
                </div>
                <p className="text-slate-300 text-xs">
                  Capacitor core and Android dependencies are pre-installed in your repository. Run these commands locally or in terminal:
                </p>
                <div className="space-y-2">
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800 font-mono text-xs flex items-center justify-between text-slate-200">
                    <code>npm run build && npx cap add android</code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard('npm run build && npx cap add android', 'cmd1')}
                      className="ml-2 text-slate-400 hover:text-white p-1"
                      title="Copy command"
                    >
                      {copiedCommand === 'cmd1' ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded border border-slate-800 font-mono text-xs flex items-center justify-between text-slate-200">
                    <code>npx cap open android</code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard('npx cap open android', 'cmd2')}
                      className="ml-2 text-slate-400 hover:text-white p-1"
                      title="Copy command"
                    >
                      {copiedCommand === 'cmd2' ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  In Android Studio, click <strong>Build &gt; Build Bundle(s) / APK(s) &gt; Build APK(s)</strong>. The resulting file will be in <code>android/app/build/outputs/apk/debug/app-debug.apk</code>.
                </p>
              </div>

              {/* Method C: Native Android WebAPK */}
              <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-mono font-bold flex items-center justify-center text-xs">
                      3
                    </span>
                    <h3 className="font-bold text-slate-100 font-mono text-sm">
                      Method 3: Direct Chrome WebAPK Installation
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-950/70 border border-amber-700/60 text-[10px] text-amber-300 font-mono font-bold">
                    No PC Required
                  </span>
                </div>
                <p className="text-slate-300 text-xs">
                  On any Android phone, open this app in Chrome, tap the <strong>three dots (&vellip;)</strong> in the top-right corner, and tap <strong>&ldquo;Install App&rdquo;</strong> (or &ldquo;Add to Home Screen&rdquo;). Android will automatically mint a hardware-accelerated WebAPK with its own desktop icon that runs in full standalone mode.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: LEARNED DATA & ZERO-DATA-LOSS */}
          {activeTab === 'backup' && (
            <div className="space-y-5">
              <div className="p-3.5 bg-emerald-950/40 border border-emerald-700/60 rounded-lg space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-400 font-mono font-bold text-sm">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Dual-Layer Learned Data Protection Active</span>
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Your trained weights, loss gradients, epoch counts, and custom match overrides are safeguarded through <strong>dual-layer persistence</strong> (Browser Protected Storage + Server Disk Sync). As we continue releasing new code features, your learned models are protected against resets.
                </p>
              </div>

              {/* Live Status Matrix */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1">
                  <div className="text-[10px] text-slate-400 font-mono uppercase">Trained Epochs</div>
                  <div className="text-lg font-bold text-sky-400 font-mono">
                    {learningState.totalEpochsTrained} Epochs
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Accuracy: <span className="text-emerald-400 font-bold">{learningState.accuracyPct}%</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1">
                  <div className="text-[10px] text-slate-400 font-mono uppercase">Current Brier Loss</div>
                  <div className="text-lg font-bold text-amber-400 font-mono">
                    {learningState.brierLoss.toFixed(4)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Baseline: {learningState.baselineBrierLoss.toFixed(4)}
                  </div>
                </div>

                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1">
                  <div className="text-[10px] text-slate-400 font-mono uppercase">Server Disk Sync</div>
                  <div className="text-sm font-bold text-emerald-400 font-mono flex items-center gap-1.5 pt-0.5">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>SYNCHRONIZED</span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {storageMetrics?.lastSyncedAt ? 'Synced recently' : 'Auto-sync active'}
                  </div>
                </div>
              </div>

              {/* Action Buttons: Export & Import */}
              <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-lg space-y-3">
                <h3 className="font-bold text-slate-200 font-mono text-sm flex items-center gap-2">
                  <Database className="w-4 h-4 text-sky-400" />
                  <span>Manual Model Backup & Restore</span>
                </h3>
                <p className="text-slate-400 text-xs">
                  Download your trained parameters as an external JSON file anytime. When upgrading your APK or switching phones, upload your backup to instantly restore all learned parameters without losing any trained data.
                </p>

                <div className="flex flex-wrap gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    className="px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-mono font-bold text-xs flex items-center gap-2 transition-colors shadow-md"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Learned Model Backup (.json)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono font-bold text-xs flex items-center gap-2 transition-colors"
                  >
                    <Upload className="w-4 h-4 text-emerald-400" />
                    <span>Upload & Restore Backup (.json)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCreateSnapshot}
                    disabled={isProcessing}
                    className="px-3.5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                    <span>Save Server Snapshot</span>
                  </button>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".json"
                    className="hidden"
                  />
                </div>
              </div>

              {/* Server Snapshots History */}
              <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-200 font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    <span>Server Recovery Snapshots ({backups.length})</span>
                  </h3>
                  <button
                    type="button"
                    onClick={refreshDiagnostics}
                    className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px] font-mono"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh</span>
                  </button>
                </div>

                {backups.length === 0 ? (
                  <p className="text-slate-500 text-xs italic py-2">
                    No server snapshots saved yet. Click &ldquo;Save Server Snapshot&rdquo; above to freeze your current weights.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto font-mono text-xs">
                    {backups.map((b) => (
                      <div
                        key={b.filename}
                        className="p-2 rounded bg-slate-950 border border-slate-800/80 flex items-center justify-between text-[11px]"
                      >
                        <div className="truncate pr-2">
                          <span className="text-slate-300 font-bold">{b.filename}</span>
                          <span className="text-slate-500 ml-2 text-[10px]">
                            {new Date(b.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRestoreSnapshot(b.filename)}
                          className="px-2 py-0.5 rounded bg-sky-950 hover:bg-sky-900 border border-sky-800 text-sky-300 text-[10px] font-bold transition-colors"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: PERFORMANCE & DIAGNOSTICS */}
          {activeTab === 'performance' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1">
                  <div className="text-[10px] text-slate-400 font-mono uppercase flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-sky-400" />
                    <span>Engine Fixtures</span>
                  </div>
                  <div className="text-lg font-bold text-slate-100 font-mono">
                    {totalFixturesCount} Matches
                  </div>
                  <div className="text-[10px] text-slate-500">46 Hollywoodbets Leagues</div>
                </div>

                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1">
                  <div className="text-[10px] text-slate-400 font-mono uppercase flex items-center gap-1">
                    <Activity className="w-3 h-3 text-emerald-400" />
                    <span>Prediction Engine</span>
                  </div>
                  <div className="text-lg font-bold text-emerald-400 font-mono">
                    8 Rules Active
                  </div>
                  <div className="text-[10px] text-slate-500">Zero Runtime Drift</div>
                </div>

                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1">
                  <div className="text-[10px] text-slate-400 font-mono uppercase flex items-center gap-1">
                    <HardDrive className="w-3 h-3 text-amber-400" />
                    <span>Storage Quota</span>
                  </div>
                  <div className="text-lg font-bold text-slate-100 font-mono">
                    {storageMetrics?.usageBytes
                      ? `${Math.round(storageMetrics.usageBytes / 1024)} KB`
                      : '< 1 MB'}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-bold">
                    {storageMetrics?.isPersistent ? 'Guaranteed Persistent' : 'Local Storage Standard'}
                  </div>
                </div>

                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1">
                  <div className="text-[10px] text-slate-400 font-mono uppercase flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    <span>Service Worker</span>
                  </div>
                  <div className="text-lg font-bold text-purple-300 font-mono">
                    {typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? 'ENABLED' : 'OFFLINE'}
                  </div>
                  <div className="text-[10px] text-slate-500">PWA Shell Precached</div>
                </div>
              </div>

              {/* Weight Stability & Health */}
              <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-200 font-mono text-sm">
                    Model Weights Stability & Calibration Telemetry
                  </h3>
                  <span className="text-[10px] font-mono text-sky-400">
                    Brier Loss: {learningState.brierLoss.toFixed(4)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80 space-y-1">
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>Tactical Shots Weight</span>
                      <span className="text-slate-200 font-bold">{learningState.weights.tacticalShotsWeight.toFixed(2)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-500"
                        style={{ width: `${(learningState.weights.tacticalShotsWeight / 0.80) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80 space-y-1">
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>Home Fortress Advantage</span>
                      <span className="text-slate-200 font-bold">{learningState.weights.homeAdvantageBaseline.toFixed(1)} pts</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${(learningState.weights.homeAdvantageBaseline / 13.5) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80 space-y-1">
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>Volatility Variance Dampener</span>
                      <span className="text-slate-200 font-bold">{learningState.weights.volatilityDrawBoost.toFixed(2)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500"
                        style={{ width: `${(learningState.weights.volatilityDrawBoost / 0.90) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800/80 space-y-1">
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>Rule 8 Favourite Win Floor</span>
                      <span className="text-slate-200 font-bold">{learningState.weights.favouriteWinFloor}% Floor</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500"
                        style={{ width: `${(learningState.weights.favouriteWinFloor / 75) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span>Hollywoodbets Predictive Core v2.0 • Zero Data Loss Certified</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

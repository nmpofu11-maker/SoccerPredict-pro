import React, { useState } from 'react';
import { MatchFixture, IngestionMetadata, AutoScrapeConfig, ScrapeLogItem } from '../types/soccer';
import { FileJson, X, Copy, Check, RefreshCw, HardDrive, ShieldAlert, ArrowDownToLine, Zap, Play, Pause, Clock } from 'lucide-react';

interface ScraperIngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: IngestionMetadata;
  fixtures: MatchFixture[];
  onImportCustomFixtures: (fixtures: MatchFixture[]) => void;
  onRestoreDefaults: () => void;
  autoScrapeConfig?: AutoScrapeConfig;
  onUpdateAutoScrapeConfig?: (config: Partial<AutoScrapeConfig>) => void;
  secondsUntilNextScrape?: number;
  isScrapingNow?: boolean;
  onTriggerScrapeNow?: () => void;
  scrapeLogs?: ScrapeLogItem[];
}

export const ScraperIngestionModal: React.FC<ScraperIngestionModalProps> = ({
  isOpen,
  onClose,
  metadata,
  fixtures,
  onImportCustomFixtures,
  onRestoreDefaults,
  autoScrapeConfig = { enabled: true, intervalSeconds: 30, lastScrapedAt: '', totalScrapesCount: 0 },
  onUpdateAutoScrapeConfig,
  secondsUntilNextScrape = 30,
  isScrapingNow = false,
  onTriggerScrapeNow,
  scrapeLogs = [],
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'payload' | 'autoscrape'>('autoscrape');
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [customJsonInput, setCustomJsonInput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  if (!isOpen) return null;

  const jsonString = JSON.stringify(fixtures, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveCustom = () => {
    try {
      setParseError(null);
      const parsed = JSON.parse(customJsonInput);
      if (!Array.isArray(parsed)) {
        throw new Error('Root element must be a JSON array of MatchFixtures.');
      }
      if (parsed.length === 0) {
        throw new Error('Array cannot be empty.');
      }
      // Basic validation
      for (const item of parsed) {
        if (!item.id || !item.kickoffTime || !item.homeTeam || !item.awayTeam) {
          throw new Error(`Item ${item.id || 'unknown'} is missing required fields (kickoffTime, homeTeam, awayTeam).`);
        }
      }
      onImportCustomFixtures(parsed as MatchFixture[]);
      setIsEditing(false);
    } catch (err: any) {
      setParseError(err.message || 'Invalid JSON format');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
              <FileJson className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white font-sans">
                Web Scraper Ingestion Manifest
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Static offline asset cache parsed directly from scraper pipeline
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pipeline Architecture Banner */}
        <div className="p-4 bg-slate-950/80 border-b border-slate-800 text-xs text-slate-300 space-y-2">
          <div className="flex items-center gap-2 font-mono text-emerald-400">
            <HardDrive className="w-4 h-4 text-emerald-400" />
            <span className="font-bold">OFFLINE PIPELINE ARCHITECTURE:</span>
          </div>
          <p className="text-slate-400 leading-relaxed font-sans">
            To eliminate third-party API request caps and timeouts, incoming match schedules, standings, and team metrics across all Hollywoodbets SA covered competitions (South African PSL, Motsepe Championship, CAF Champions League, English Pyramid tiers, European leagues & International Qualifiers) are scraped and parsed into static assets (`upcoming_fixtures.json`). All user overrides and analysis rules persist in browser <code className="text-sky-300 font-mono">localStorage</code>.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
            <div className="bg-slate-900 p-2 rounded border border-slate-800">
              <div className="text-slate-500">INGESTION MODE</div>
              <div className="text-white font-semibold">Local Static File</div>
            </div>
            <div className="bg-slate-900 p-2 rounded border border-slate-800">
              <div className="text-slate-500">PARSED FIXTURES</div>
              <div className="text-emerald-400 font-semibold">{fixtures.length} matches</div>
            </div>
            <div className="bg-slate-900 p-2 rounded border border-slate-800">
              <div className="text-slate-500">FAVOURITES FOUND</div>
              <div className="text-amber-400 font-semibold">{metadata.favouriteMatchesCount} teams</div>
            </div>
            <div className="bg-slate-900 p-2 rounded border border-slate-800">
              <div className="text-slate-500">DATA PERSISTENCE</div>
              <div className="text-sky-400 font-semibold">localStorage</div>
            </div>
          </div>
        </div>

        {/* Sub-Tabs: Auto-Scrape vs Raw Payload */}
        <div className="flex items-center px-4 bg-slate-950 border-b border-slate-800 text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveSubTab('autoscrape')}
            className={`py-2.5 px-4 font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeSubTab === 'autoscrape'
                ? 'border-sky-500 text-white bg-slate-900/50'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-sky-400" />
            <span>Auto-Scraper Engine</span>
            <span className={`w-2 h-2 rounded-full ${autoScrapeConfig.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('payload')}
            className={`py-2.5 px-4 font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeSubTab === 'payload'
                ? 'border-sky-500 text-white bg-slate-900/50'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileJson className="w-3.5 h-3.5 text-emerald-400" />
            <span>Raw Ingestion JSON ({fixtures.length})</span>
          </button>
        </div>

        {/* Tab Content: Auto-Scraper Engine */}
        {activeSubTab === 'autoscrape' ? (
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 flex flex-col space-y-4">
            {/* Auto-Scraper Controls Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white font-mono">
                      AUTOMATIC INGESTION CADENCE
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        autoScrapeConfig.enabled
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {autoScrapeConfig.enabled ? 'RUNNING AUTOMATICALLY' : 'PAUSED'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 font-sans">
                    Runs simulated offline web-scraper cycles on an automated timer without exhausting external API limits.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdateAutoScrapeConfig?.({ enabled: !autoScrapeConfig.enabled })}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                      autoScrapeConfig.enabled
                        ? 'bg-amber-950/60 border border-amber-800 text-amber-300 hover:bg-amber-900/60'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    {autoScrapeConfig.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{autoScrapeConfig.enabled ? 'Pause Auto-Scrape' : 'Activate Auto-Scrape'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isScrapingNow}
                    onClick={onTriggerScrapeNow}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-mono font-bold transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScrapingNow ? 'animate-spin' : ''}`} />
                    <span>Scrape Now</span>
                  </button>
                </div>
              </div>

              {/* Cadence Settings & Countdown Matrix */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Cadence Selector */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase font-mono font-bold">
                    SCRAPE CADENCE INTERVAL
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    {[15, 30, 60, 300].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => onUpdateAutoScrapeConfig?.({ intervalSeconds: sec })}
                        className={`flex-1 py-1 text-center font-mono text-xs rounded transition-all ${
                          autoScrapeConfig.intervalSeconds === sec
                            ? 'bg-sky-500 text-slate-950 font-bold'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {sec < 60 ? `${sec}s` : `${sec / 60}m`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Countdown Timer */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase font-mono font-bold">
                    TIME TO NEXT AUTO-SCRAPE
                  </div>
                  <div className="text-xl font-extrabold text-sky-400 font-mono mt-1 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-sky-400" />
                    <span>{autoScrapeConfig.enabled ? `${secondsUntilNextScrape}s` : 'PAUSED'}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Cadence: {autoScrapeConfig.intervalSeconds}s interval
                  </div>
                </div>

                {/* Total Auto-Scrapes Executed */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase font-mono font-bold">
                    TOTAL AUTO-CYCLES
                  </div>
                  <div className="text-xl font-extrabold text-emerald-400 font-mono mt-1">
                    {autoScrapeConfig.totalScrapesCount} Completed
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    0 API requests incurred
                  </div>
                </div>
              </div>
            </div>

            {/* Auto-Scraper Event Log */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="font-bold text-slate-300">SCRAPER EXECUTION TELEMETRY LOG</span>
                <span>{scrapeLogs.length} events logged</span>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden font-mono text-xs">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 text-[10px] uppercase">
                      <th className="p-2.5">Time</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Fixtures</th>
                      <th className="p-2.5">80 Favs In Play</th>
                      <th className="p-2.5 hidden sm:table-cell">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {scrapeLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="p-2.5 text-slate-300 font-bold">{log.timestamp}</td>
                        <td className="p-2.5">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px]">
                            {log.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-200">{log.fixturesCount} matches</td>
                        <td className="p-2.5 text-amber-400">{log.favouritesCount} teams</td>
                        <td className="p-2.5 text-slate-400 truncate max-w-xs hidden sm:table-cell">
                          {log.details}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          /* Content Viewer / Editor */
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400">
                {isEditing ? 'Paste custom scraped JSON array:' : 'Active Fixtures Manifest Payload (JSON):'}
              </span>
              <div className="flex items-center gap-2">
                {!isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomJsonInput(jsonString);
                        setIsEditing(true);
                      }}
                      className="flex items-center gap-1 px-3 py-1 rounded bg-sky-950 border border-sky-800 hover:bg-sky-900 text-xs font-mono text-sky-300 transition-colors"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" />
                      <span>Import/Paste Data</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1 rounded bg-slate-800 text-xs font-mono text-slate-300 hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {parseError && (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-mono flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>{parseError}</span>
              </div>
            )}

            {isEditing ? (
              <textarea
                value={customJsonInput}
                onChange={(e) => setCustomJsonInput(e.target.value)}
                className="w-full flex-1 min-h-[260px] bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-sky-500 resize-none"
                placeholder="Paste valid JSON array of MatchFixtures..."
              />
            ) : (
              <pre className="w-full flex-1 min-h-[260px] max-h-[360px] overflow-auto bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-slate-300 leading-relaxed select-all">
                {jsonString}
              </pre>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 text-xs text-slate-400">
          <button
            type="button"
            onClick={onRestoreDefaults}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-mono transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            <span>Restore Factory Static Bundle</span>
          </button>

          <div className="flex items-center gap-2 justify-end">
            {isEditing && (
              <button
                type="button"
                onClick={handleSaveCustom}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
              >
                Apply Ingestion Payload
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

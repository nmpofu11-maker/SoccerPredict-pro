import React, { useState, useRef, useEffect } from 'react';
import { AlertTriangle, X, ShieldAlert, CheckCircle } from 'lucide-react';
import { AnomalousMatchDetail } from '../utils/robustMetricsCalculator';

interface OutlierIndicatorProps {
  teamName?: string;
  hasOutliersCleaned: boolean;
  notes?: string[];
  anomalousMatches?: AnomalousMatchDetail[];
  anomalousCount?: number;
  variant?: 'icon' | 'badge' | 'chip';
  size?: 'xs' | 'sm' | 'md';
  inlineLabel?: string;
  id?: string;
}

export const OutlierIndicator: React.FC<OutlierIndicatorProps> = ({
  teamName = 'Team',
  hasOutliersCleaned,
  notes = [],
  anomalousMatches = [],
  anomalousCount = 0,
  variant = 'icon',
  size = 'sm',
  inlineLabel,
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!hasOutliersCleaned) {
    return null;
  }

  const iconSizes = {
    xs: 'w-2.5 h-2.5',
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
  };

  const tooltipTitle = `${teamName} stats cleaned of anomalous outliers (${anomalousCount > 0 ? `${anomalousCount} match(es) ignored` : 'freak results quarantined'}). Click to inspect.`;

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center"
      id={id || `outlier-indicator-${teamName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
    >
      {/* TRIGGER BUTTON */}
      {variant === 'icon' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          title={tooltipTitle}
          aria-label={`Warning: ${tooltipTitle}`}
          className="inline-flex items-center justify-center text-amber-400 hover:text-amber-300 p-0.5 rounded transition-transform hover:scale-110 active:scale-95 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer"
        >
          <AlertTriangle className={`${iconSizes[size]} drop-shadow-sm flex-shrink-0 animate-pulse`} />
        </button>
      )}

      {variant === 'chip' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          title={tooltipTitle}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 hover:border-amber-400 transition-all text-[9px] font-mono cursor-pointer"
        >
          <AlertTriangle className={`${iconSizes[size]} text-amber-400 flex-shrink-0`} />
          <span className="font-semibold">{inlineLabel || 'Outliers Cleaned'}</span>
        </button>
      )}

      {variant === 'badge' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          title={tooltipTitle}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-950/70 border border-amber-500/50 text-amber-300 hover:border-amber-400 transition-all text-[9.5px] font-mono cursor-pointer shadow-sm"
        >
          <AlertTriangle className={`${iconSizes[size]} text-amber-400 flex-shrink-0`} />
          <span className="font-bold tracking-tight">Outliers Cleaned</span>
          {anomalousCount > 0 && (
            <span className="bg-amber-400/20 text-amber-300 px-1 rounded-full text-[8.5px] font-extrabold">
              {anomalousCount}
            </span>
          )}
        </button>
      )}

      {/* INTERACTIVE POPOVER / TOOLTIP */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-50 bottom-full mb-1.5 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-auto sm:right-0 w-72 sm:w-80 p-3 bg-slate-950 border border-amber-500/60 rounded-xl shadow-2xl text-left font-sans text-xs text-slate-200 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Popover Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="p-1 rounded bg-amber-500/20 text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <h4 className="font-bold font-mono text-[11px] text-amber-300 uppercase tracking-wide truncate">
                  Outlier-Cleaned Data
                </h4>
                <p className="text-[10px] text-slate-400 truncate">
                  {teamName} baseline normalized
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Explanation description */}
          <p className="text-[11px] text-slate-300 leading-relaxed mb-2 font-mono">
            The rules engine automatically detected and quarantined anomalous match results to prevent skewed baseline statistics.
          </p>

          {/* Quarantined Match Details */}
          {anomalousMatches.length > 0 && (
            <div className="mb-2 space-y-1 bg-slate-900/80 p-2 rounded border border-slate-800 text-[10px] font-mono">
              <span className="text-slate-400 font-bold uppercase text-[9px] block mb-1">
                Ignored Anomalous Matches:
              </span>
              {anomalousMatches.map((m, idx) => (
                <div key={idx} className="flex items-start gap-1.5 text-amber-200/90">
                  <span className="text-amber-400 font-bold">•</span>
                  <div>
                    <span className="font-bold text-white">vs {m.opponent} ({m.score})</span>
                    <span className="block text-slate-400 text-[9.5px]">{m.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Detailed Cleaning Notes */}
          {notes.length > 0 && (
            <div className="space-y-1 mb-2 bg-slate-900/60 p-2 rounded border border-slate-800/80 text-[10.5px] font-mono text-slate-300">
              <span className="text-slate-400 font-bold uppercase text-[9px] block mb-1">
                Engine Adjustments:
              </span>
              {notes.map((note, idx) => (
                <div key={idx} className="flex items-start gap-1.5 text-slate-300">
                  <CheckCircle className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span className="leading-snug">{note}</span>
                </div>
              ))}
            </div>
          )}

          {/* Bottom badge info */}
          <div className="pt-1.5 border-t border-slate-900 flex items-center justify-between text-[9px] text-slate-400 font-mono">
            <span>Winsorized normalization</span>
            <span className="text-amber-400 font-bold">Rule 05 Protected</span>
          </div>
        </div>
      )}
    </div>
  );
};

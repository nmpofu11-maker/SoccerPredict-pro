import React, { useState } from 'react';
import { HomeWinTrendSummary, ProbabilityTrendPoint } from '../utils/probabilityTrend';
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';

interface HomeWinSparklineProps {
  trend: HomeWinTrendSummary;
  teamName: string;
}

export const HomeWinSparkline: React.FC<HomeWinSparklineProps> = ({ trend, teamName }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const { points, direction, netChange, streakDescription } = trend;

  // SVG Chart dimensions
  const width = 76;
  const height = 24;
  const paddingX = 4;
  const paddingY = 4;

  const probs = points.map((p) => p.probability);
  const minVal = Math.min(...probs);
  const maxVal = Math.max(...probs);
  const range = Math.max(maxVal - minVal, 8); // Avoid division by zero, maintain visible curve

  // Calculate coordinates for each of the 4 points
  const coords = points.map((p, i) => {
    const x = paddingX + (i / (points.length - 1)) * (width - 2 * paddingX);
    // Invert Y since SVG y=0 is top
    const normalizedY = (p.probability - (minVal - 2)) / (range + 4);
    const y = height - paddingY - normalizedY * (height - 2 * paddingY);
    return { x, y, point: p };
  });

  // Generate SVG polyline path string
  const pathD = coords.reduce((acc, curr, idx) => {
    return idx === 0 ? `M ${curr.x.toFixed(1)},${curr.y.toFixed(1)}` : `${acc} L ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
  }, '');

  // Generate area fill path string (closing to bottom)
  const firstX = coords[0].x.toFixed(1);
  const lastX = coords[coords.length - 1].x.toFixed(1);
  const bottomY = (height - 1).toFixed(1);
  const areaD = `${pathD} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`;

  // Color theme according to trend direction
  const isUp = direction === 'up';
  const isDown = direction === 'down';

  const strokeColor = isUp ? '#34d399' : isDown ? '#f43f5e' : '#38bdf8';
  const gradientId = `sparkline-grad-${teamName.replace(/[^a-zA-Z0-9]/g, '')}-${points[3]?.probability || 0}`;

  return (
    <div
      className="relative flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors select-none group cursor-pointer"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip((prev) => !prev)}
      title="Click/Hover to inspect Home Win Probability fluctuation over the last 3 matches"
    >
      {/* Mini Title & Trend Indicator Badge */}
      <div className="flex flex-col items-start min-w-[46px]">
        <span className="text-[8.5px] font-mono uppercase tracking-wider text-slate-400 font-semibold leading-none">
          HOME TREND
        </span>
        <div className="flex items-center gap-0.5 mt-0.5 font-mono text-[10px] font-bold">
          {isUp ? (
            <TrendingUp className="w-2.5 h-2.5 text-emerald-400" />
          ) : isDown ? (
            <TrendingDown className="w-2.5 h-2.5 text-rose-400" />
          ) : (
            <Minus className="w-2.5 h-2.5 text-sky-400" />
          )}
          <span
            className={
              isUp
                ? 'text-emerald-400'
                : isDown
                ? 'text-rose-400'
                : 'text-sky-300'
            }
          >
            {netChange > 0 ? `+${netChange}%` : `${netChange}%`}
          </span>
        </div>
      </div>

      {/* SVG Sparkline Graph */}
      <div className="relative w-[76px] h-[24px] flex-shrink-0">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="overflow-visible"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={strokeColor}
                stopOpacity={0.35}
              />
              <stop
                offset="100%"
                stopColor={strokeColor}
                stopOpacity={0.0}
              />
            </linearGradient>
          </defs>

          {/* Area Fill */}
          <path d={areaD} fill={`url(#${gradientId})`} />

          {/* Sparkline Stroke */}
          <path
            d={pathD}
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data Points */}
          {coords.map((c, idx) => {
            const isLast = idx === coords.length - 1;
            return (
              <g key={idx}>
                {isLast && (
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r="4.5"
                    fill={strokeColor}
                    fillOpacity="0.25"
                    className="animate-ping"
                  />
                )}
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={isLast ? '2.75' : '2'}
                  fill={isLast ? '#ffffff' : strokeColor}
                  stroke={isLast ? strokeColor : '#0f172a'}
                  strokeWidth="1"
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Hover Floating Tooltip Modal */}
      {showTooltip && (
        <div
          className="absolute right-0 bottom-full mb-2 z-50 w-64 bg-slate-900/98 border border-slate-700 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs font-mono animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
            <div className="flex items-center gap-1.5 text-slate-200 font-bold">
              <Info className="w-3.5 h-3.5 text-sky-400" />
              <span>{teamName} Win Trend</span>
            </div>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                isUp
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                  : isDown
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                  : 'bg-sky-950/80 text-sky-300 border border-sky-800/60'
              }`}
            >
              {streakDescription}
            </span>
          </div>

          {/* Fluctuation Steps */}
          <div className="space-y-1.5">
            {points.map((p, idx) => {
              const isCurrent = p.isCurrent;
              return (
                <div
                  key={idx}
                  className={`flex items-center justify-between px-2 py-1 rounded text-[11px] ${
                    isCurrent
                      ? 'bg-slate-800/80 border border-sky-500/40 text-white font-bold'
                      : 'bg-slate-950/50 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-[10px] text-slate-400 w-8">{p.shortLabel}:</span>
                    {p.result && (
                      <span
                        className={`w-3.5 h-3.5 rounded text-[9px] font-bold flex items-center justify-center ${
                          p.result === 'W'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : p.result === 'D'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {p.result}
                      </span>
                    )}
                    <span className="truncate">
                      {isCurrent ? 'Current Assessment' : p.opponent ? `vs ${p.opponent}` : p.label}
                    </span>
                  </div>
                  <span
                    className={
                      isCurrent
                        ? 'text-sky-400 font-black'
                        : 'text-slate-300 font-semibold'
                    }
                  >
                    {p.probability}%
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-2 pt-1.5 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
            <span>Range: {trend.minProb}% - {trend.maxProb}%</span>
            <span>Avg: {trend.averageProb}%</span>
          </div>
        </div>
      )}
    </div>
  );
};

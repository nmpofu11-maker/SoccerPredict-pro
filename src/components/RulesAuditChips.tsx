import React from 'react';
import { RuleAppliedItem } from '../types/soccer';
import { Info } from 'lucide-react';

interface RulesAuditChipsProps {
  rules: RuleAppliedItem[];
  matchId: string;
}

export const RulesAuditChips: React.FC<RulesAuditChipsProps> = ({ rules, matchId }) => {
  if (!rules || rules.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 italic py-1 font-mono">
        <span>No modifiers triggered (baseline distribution).</span>
      </div>
    );
  }

  return (
    <div className="w-full pt-1" id={`rules-audit-${matchId}`}>
      <div className="flex flex-wrap gap-1 mb-1">
        {rules.map((rule, idx) => (
          <span
            key={`${matchId}-rule-${rule.ruleNumber}-${idx}`}
            className={`text-[8.5px] px-2 py-0.5 rounded border uppercase font-mono cursor-help transition-colors ${
              rule.ruleNumber === 8
                ? 'bg-purple-950/70 text-purple-300 border-purple-600/50 font-bold'
                : rule.tag.includes('FAVOURITE')
                ? 'bg-amber-950/60 text-amber-300 border-amber-600/40 font-bold'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
            }`}
            title={`${rule.ruleName}: ${rule.impact} — ${rule.description}`}
          >
            [{rule.tag}]
          </span>
        ))}
      </div>
    </div>
  );
};

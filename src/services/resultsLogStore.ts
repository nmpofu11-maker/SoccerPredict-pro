import fs from 'node:fs';
import { parseResultsArrays } from './resultsLogParser';

export interface SettledResultRecord {
  id: string;
  homeScore: number;
  awayScore: number;
  actualOutcome: 'home' | 'draw' | 'away';
  [key: string]: unknown;
}

/**
 * Missing files are valid on first run. An existing empty, malformed, or
 * structurally invalid ledger fails closed so callers cannot mistake damaged
 * history for an empty ledger and overwrite it.
 */
export function readResultsLogFile<T = SettledResultRecord>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) {
    throw new Error('Results log is empty; settlement halted to protect existing history.');
  }

  let entries: T[];
  try {
    entries = parseResultsArrays<T>(content);
  } catch {
    throw new Error('Results log is malformed; settlement halted to protect existing history.');
  }

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index] as unknown as SettledResultRecord | null;
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.id !== 'string' ||
      entry.id.trim().length === 0 ||
      !Number.isFinite(entry.homeScore) ||
      !Number.isFinite(entry.awayScore) ||
      !['home', 'draw', 'away'].includes(entry.actualOutcome)
    ) {
      throw new Error(`Results log contains an invalid settlement record at index ${index}; settlement halted to protect existing history.`);
    }
  }

  return entries;
}

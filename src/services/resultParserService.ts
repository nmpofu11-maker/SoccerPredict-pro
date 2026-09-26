/**
 * Result Parser Service
 * 
 * Handles parsing of raw match results copied from sports websites.
 */

import { HistoricalMatchResult } from '../types/soccer';

export interface RawResult {
  matchTitle: string; // e.g. "HomeTeam vs AwayTeam"
  homeScore: number;
  awayScore: number;
  date: string; // YYYY-MM-DD
}

export function parseRawResults(text: string): RawResult[] {
  // This is a placeholder for a more complex parser that you will populate
  // based on the specific format you copy from your source site.
  // Example expected line: HomeTeam vs AwayTeam|2|1|2026-09-26
  return text.split('\n').filter(line => line.trim() !== '').map(line => {
    const [title, h, a, date] = line.split('|');
    return {
      matchTitle: title,
      homeScore: parseInt(h),
      awayScore: parseInt(a),
      date
    };
  });
}

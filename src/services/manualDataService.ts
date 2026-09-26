/**
 * Manual Data Service
 * 
 * Handles parsing of raw fixture data (e.g., from CSV/text copy-paste)
 * and normalizes it to the internal MatchFixture format.
 */

import { MatchFixture, TeamStats } from '../types/soccer';
import * as pdf from 'pdf-parse';
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';

export interface RawFixture {
  time: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string; // YYYY-MM-DD
}

export function mapRawToMatchFixture(raw: RawFixture): MatchFixture {
  const kickoffTime = `${raw.date}T${raw.time}:00Z`;

  // Default team stats for AI engine consumption
  const defaultTeamStats: TeamStats = {
    id: 'unknown',
    name: 'Unknown',
    shortName: 'UNK',
    leagueRank: 0,
    points: 0,
    form: [],
    avgPossession: 50,
    avgShotsOnTarget: 5,
  };

  return {
    id: `manual_${Date.now()}_${raw.homeTeam}_${raw.awayTeam}`,
    kickoffTime,
    league: raw.league,
    venue: `${raw.homeTeam} Stadium`,
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: { ...defaultTeamStats, id: raw.homeTeam, name: raw.homeTeam, shortName: raw.homeTeam.slice(0, 3).toUpperCase() },
    awayTeam: { ...defaultTeamStats, id: raw.awayTeam, name: raw.awayTeam, shortName: raw.awayTeam.slice(0, 3).toUpperCase() },
    h2h: { homeWins: 0, draws: 0, awayWins: 0, totalLast5: 0 },
  };
}

export function parseRawFixtures(rawLines: string[]): MatchFixture[] {
  // Simple parser expecting rows of data
  return rawLines.map(line => {
    const [time, home, away, league, date] = line.split('|');
    return mapRawToMatchFixture({ time, homeTeam: home, awayTeam: away, league, date });
  });
}

export async function extractTextFromPDF(filePath: string): Promise<string> {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdf(dataBuffer);
  return data.text;
}

export async function scrapeUrl(url: string): Promise<string> {
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);
  // Basic scraping - assuming text content or specific table structure
  // This will need custom logic per target site. Returning body text for now.
  return $('body').text();
}

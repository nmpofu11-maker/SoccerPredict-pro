/**
 * Manual Data Service
 * 
 * Handles parsing of raw fixture data (e.g., from CSV/text copy-paste)
 * and normalizes it to the internal MatchFixture format.
 */

import { MatchFixture, TeamStats } from '../types/soccer';
import { PDFParse } from 'pdf-parse';
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import { isIP } from 'net';

export interface RawFixture {
  time: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string; // YYYY-MM-DD
}

export function mapRawToMatchFixture(raw: RawFixture): MatchFixture {
  const safeDate = String(raw.date || '').trim();
  const safeTime = String(raw.time || '').trim();
  const kickoffTime = safeDate && safeTime ? `${safeDate}T${safeTime}:00` : null;

  const makeUnknownTeamStats = (name: string): TeamStats => ({
    id: name,
    name,
    shortName: name.slice(0, 3).toUpperCase(),
    leagueRank: null,
    points: null,
    form: [],
    avgPossession: null,
    avgShotsOnTarget: null,
    isHomeDominant: false,
    hasTopTierAwayForm: false,
  });

  return {
    id: `manual_${safeDate}_${safeTime}_${raw.homeTeam}_${raw.awayTeam}`.replace(/[^a-zA-Z0-9_-]+/g, '_'),
    kickoffTime,
    league: raw.league,
    venue: `${raw.homeTeam} Stadium`,
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: makeUnknownTeamStats(raw.homeTeam),
    awayTeam: makeUnknownTeamStats(raw.awayTeam),
    h2h: { homeWins: 0, draws: 0, awayWins: 0, totalLast5: 0 },
  };
}

export function parseRawFixtures(rawLines: string[]): MatchFixture[] {
  return rawLines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split('|').map((part) => part.trim());
      if (parts.length < 5 || parts.slice(0, 5).some((part) => !part)) {
        throw new Error(`Invalid fixture row at line ${index + 1}: expected time|home|away|league|date`);
      }
      const [time, home, away, league, date] = parts;
      return mapRawToMatchFixture({ time, homeTeam: home, awayTeam: away, league, date });
    });
}

export async function extractTextFromPDF(filePath: string): Promise<string> {
  const dataBuffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: dataBuffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

export async function scrapeUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid scrape URL.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only HTTP(S) scrape URLs are allowed.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const ipVersion = isIP(hostname);
  const blockedHost =
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === 'metadata.google.internal' ||
    hostname === '169.254.169.254' ||
    (ipVersion === 4 && (
      hostname.startsWith('10.') ||
      hostname.startsWith('127.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') ||
      hostname.startsWith('172.19.') ||
      hostname.startsWith('172.20.') ||
      hostname.startsWith('172.21.') ||
      hostname.startsWith('172.22.') ||
      hostname.startsWith('172.23.') ||
      hostname.startsWith('172.24.') ||
      hostname.startsWith('172.25.') ||
      hostname.startsWith('172.26.') ||
      hostname.startsWith('172.27.') ||
      hostname.startsWith('172.28.') ||
      hostname.startsWith('172.29.') ||
      hostname.startsWith('172.30.') ||
      hostname.startsWith('172.31.')
    ));

  if (blockedHost) throw new Error('Scrape URL targets a private or local address.');

  const { data } = await axios.get(url, {
    timeout: 10000,
    maxContentLength: 2 * 1024 * 1024,
    maxBodyLength: 2 * 1024 * 1024,
    responseType: 'text',
  });
  const $ = cheerio.load(data);
  // Basic scraping - assuming text content or specific table structure
  // This will need custom logic per target site. Returning body text for now.
  return $('body').text();
}

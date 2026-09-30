import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createHash, timingSafeEqual } from 'crypto';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { verifyAndSanitizeFixtures } from './src/services/dataIntegrityValidator';
import { parseHollywoodbetsRawText } from './src/services/hollywoodbetsParser';
import type { DataIntegrityAuditReport } from './src/types/soccer';
import {
  sportApiAiConfigured,
  fetchSportApiAiFixturesByDate,
  isSportApiAiFixtureFinished,
  getSportApiAiScores,
} from './src/services/serverSportApiAi';
import {
  theRundownConfigured,
  fetchAllTheRundownSoccerEvents,
  isTheRundownEventFinished,
  getTheRundownScores,
} from './src/services/serverTheRundown';
import { extractTextFromPDF, scrapeUrl } from './src/services/manualDataService';
import { evaluateFixturePrediction, sanitizeEngineWeights } from './src/engine/rulesEngine';
import {
  appendPrediction,
  appendOutcome,
  computeInputCoverage,
  readLog,
  summarize,
  verifyLog,
} from './src/services/predictionLog';
import { parseRawResults } from './src/services/resultParserService';

dotenv.config();

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const ADMIN_API_KEY = process.env.ADMIN_API_KEY?.trim() || '';

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!ADMIN_API_KEY) {
    res.status(503).json({ error: 'Administrative API is not configured.' });
    return;
  }

  const supplied = req.get('x-admin-api-key') || '';
  const expected = Buffer.from(ADMIN_API_KEY);
  const actual = Buffer.from(supplied);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    res.status(401).json({ error: 'Administrative authorization required.' });
    return;
  }
  next();
}

const PORT = 3000;

const MANIFEST_PATH = path.join(process.cwd(), 'data', 'fixtures-manifest.json');
const SRC_FIXTURES_PATH = path.join(process.cwd(), 'src', 'data', 'upcoming_fixtures.json');

function getDynamicCutoffIso(): string {
  // Retain matches from 48 hours ago through future dates to allow yesterday analysis
  const d = new Date(Date.now() - 48 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function ensureDataDirectory(): void {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function readRawDiskManifest(): any[] {
  ensureDataDirectory();
  let list: any[] = [];

  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
      if (Array.isArray(data)) list = data;
    } catch (e) {
      console.warn('Error reading raw fixtures-manifest.json:', e);
    }
  }

  if (list.length === 0 && fs.existsSync(SRC_FIXTURES_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(SRC_FIXTURES_PATH, 'utf-8'));
      if (Array.isArray(data)) list = data;
    } catch (e) {
      console.warn('Error reading source fixture manifest:', e);
    }
  }

  return list;
}

export function readDiskManifest(): any[] {
  ensureDataDirectory();
  const minCutoff = getDynamicCutoffIso();
  let list: any[] = [];

  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
      if (Array.isArray(data)) {
        list = data;
      }
    } catch (e) {
      console.warn('Error reading fixtures-manifest.json:', e);
    }
  }

  if (list.length === 0 && fs.existsSync(SRC_FIXTURES_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(SRC_FIXTURES_PATH, 'utf-8'));
      if (Array.isArray(data)) {
        list = data;
        // Sync to primary data manifest
        try {
          fs.writeFileSync(MANIFEST_PATH, JSON.stringify(list, null, 2), 'utf-8');
        } catch {}
      }
    } catch (e) {
      console.warn('Error reading upcoming_fixtures.json:', e);
    }
  }

  return list.filter(
    (f: any) => f && f.id && f.homeTeam && f.awayTeam && (!f.kickoffTime || f.kickoffTime.slice(0, 10) >= minCutoff)
  );
}

export function writeDiskManifest(fixtures: any[]): void {
  ensureDataDirectory();
  try {
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(fixtures, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing to data/fixtures-manifest.json:', e);
  }
  try {
    const srcDir = path.join(process.cwd(), 'src', 'data');
    if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(SRC_FIXTURES_PATH, JSON.stringify(fixtures, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing to src/data/upcoming_fixtures.json:', e);
  }
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface LiveFixturesCache {
  fixtures: any[];
  syncedAt: string;
  provider: string;
  auditReport?: DataIntegrityAuditReport;
}

function loadInitialDiskCache(): LiveFixturesCache {
  const fallback = readDiskManifest();
  const { fixtures: sanitizedFallback, auditReport: fallbackAudit } = verifyAndSanitizeFixtures(fallback);
  return {
    fixtures: sanitizedFallback,
    syncedAt: new Date().toISOString(),
    provider: 'Disk Manifest (Sanitized)',
    auditReport: fallbackAudit,
  };
}

let fixturesCache: LiveFixturesCache | null = loadInitialDiskCache();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

const HOLLYWOODBETS_LEAGUES = [
  // South Africa & Africa (Hollywoodbets Core Home Markets & Amateur/Regional)
  { code: 'rsa.1', name: 'South African Premiership', isHighStakes: true },
  { code: 'rsa.2', name: 'South African First Division', isHighStakes: false },
  { code: 'rsa.mtn8', name: 'South African MTN 8 Cup', isHighStakes: true },
  { code: 'rsa.nedbank', name: 'South African Nedbank Cup', isHighStakes: true },
  { code: 'rsa.carling', name: 'South African Carling Knockout Cup', isHighStakes: true },
  { code: 'rsa.abc_motsepe', name: 'South African ABC Motsepe Regional League (Amateur)', isHighStakes: false },
  { code: 'rsa.diski', name: 'South African Diski Shield / Reserves', isHighStakes: false },
  { code: 'caf.champions', name: 'CAF Champions League', isHighStakes: true },
  { code: 'caf.confed', name: 'CAF Confederation Cup', isHighStakes: true },
  { code: 'fifa.worldq.caf', name: 'FIFA World Cup Qualifying - CAF', isHighStakes: true },

  // England & UK (Including Non-League & Amateur)
  { code: 'eng.1', name: 'English Premier League', isHighStakes: true },
  { code: 'eng.2', name: 'English Championship', isHighStakes: false },
  { code: 'eng.3', name: 'English League One', isHighStakes: false },
  { code: 'eng.4', name: 'English League Two', isHighStakes: false },
  { code: 'eng.5', name: 'English National League (Semi-Pro/Amateur)', isHighStakes: false },
  { code: 'eng.fa', name: 'English FA Cup', isHighStakes: true },
  { code: 'eng.league_cup', name: 'English Carabao Cup', isHighStakes: false },
  { code: 'sco.1', name: 'Scottish Premiership', isHighStakes: false },
  { code: 'sco.2', name: 'Scottish Championship', isHighStakes: false },

  // European Continental (UEFA)
  { code: 'uefa.champions', name: 'UEFA Champions League', isHighStakes: true },
  { code: 'uefa.europa', name: 'UEFA Europa League', isHighStakes: true },
  { code: 'uefa.europa.conf', name: 'UEFA Conference League', isHighStakes: false },
  { code: 'uefa.nations', name: 'UEFA Nations League', isHighStakes: false },
  { code: 'fifa.worldq.uefa', name: 'FIFA World Cup Qualifying - UEFA', isHighStakes: true },

  // European Top Flights & Second Tiers
  { code: 'esp.1', name: 'Spanish La Liga', isHighStakes: true },
  { code: 'esp.2', name: 'Spanish LaLiga 2', isHighStakes: false },
  { code: 'esp.copa_del_rey', name: 'Spanish Copa del Rey', isHighStakes: true },
  { code: 'ita.1', name: 'Italian Serie A', isHighStakes: true },
  { code: 'ita.2', name: 'Italian Serie B', isHighStakes: false },
  { code: 'ita.coppa_italia', name: 'Italian Coppa Italia', isHighStakes: true },
  { code: 'ger.1', name: 'German Bundesliga', isHighStakes: true },
  { code: 'ger.2', name: 'German 2. Bundesliga', isHighStakes: false },
  { code: 'ger.dfb_pokal', name: 'German DFB-Pokal', isHighStakes: true },
  { code: 'fra.1', name: 'French Ligue 1', isHighStakes: false },
  { code: 'fra.2', name: 'French Ligue 2', isHighStakes: false },
  { code: 'fra.coupe_de_france', name: 'French Coupe de France', isHighStakes: true },
  { code: 'ned.1', name: 'Dutch Eredivisie', isHighStakes: false },
  { code: 'ned.cup', name: 'Dutch KNVB Beker', isHighStakes: false },
  { code: 'por.1', name: 'Portuguese Primeira Liga', isHighStakes: false },
  { code: 'tur.1', name: 'Turkish Super Lig', isHighStakes: false },
  { code: 'bel.1', name: 'Belgian Pro League', isHighStakes: false },
  { code: 'gre.1', name: 'Greek Super League', isHighStakes: false },
  { code: 'sui.1', name: 'Swiss Super League', isHighStakes: false },
  { code: 'aut.1', name: 'Austrian Bundesliga', isHighStakes: false },
  { code: 'den.1', name: 'Danish Superliga', isHighStakes: false },
  { code: 'nor.1', name: 'Norwegian Eliteserien', isHighStakes: false },
  { code: 'swe.1', name: 'Swedish Allsvenskan', isHighStakes: false },
  { code: 'rou.1', name: 'Romanian Liga I', isHighStakes: false },
  { code: 'irl.1', name: 'Irish Premier Division', isHighStakes: false },

  // Rest of World & Americas
  { code: 'ksa.1', name: 'Saudi Pro League', isHighStakes: true },
  { code: 'usa.1', name: 'Major League Soccer', isHighStakes: false },
  { code: 'bra.1', name: 'Brazilian Serie A', isHighStakes: false },
  { code: 'arg.1', name: 'Argentine Liga Profesional', isHighStakes: false },
  { code: 'mex.1', name: 'Mexican Liga MX', isHighStakes: false },
  { code: 'col.1', name: 'Colombia Primera A', isHighStakes: true },
  { code: 'chi.1', name: 'Chile Primera División', isHighStakes: true },
  { code: 'bol.1', name: 'Bolivian Primera División', isHighStakes: false },
  { code: 'conmebol.libertadores', name: 'Copa Libertadores', isHighStakes: true },
  { code: 'conmebol.sudamericana', name: 'Copa Sudamericana', isHighStakes: true },
  { code: 'aus.1', name: 'Australian A-League', isHighStakes: false },
  { code: 'jpn.1', name: 'Japanese J.League', isHighStakes: false },
  { code: 'chn.1', name: 'Chinese Super League', isHighStakes: false },
  { code: 'fifa.worldq.conmebol', name: 'FIFA World Cup Qualifying - CONMEBOL', isHighStakes: true },
];

function parseForm(formStr: unknown): ('W' | 'D' | 'L')[] {
  if (typeof formStr !== 'string') return [];
  const res: ('W' | 'D' | 'L')[] = [];
  for (const ch of formStr.toUpperCase()) {
    if (ch === 'W' || ch === 'D' || ch === 'L') {
      res.push(ch as 'W' | 'D' | 'L');
    }
    if (res.length >= 5) break;
  }
  return res;
}

function parsePoints(recordSummary: unknown): number | null {
  if (typeof recordSummary !== 'string') return null;
  const parts = recordSummary.split('-').map((part) => Number(part.trim()));
  if (parts.length < 3 || !parts.slice(0, 3).every((part) => Number.isFinite(part) && part >= 0)) return null;
  return parts[0] * 3 + parts[1];
}

function getApplicationDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TIMEZONE || 'Africa/Johannesburg',
  }).format(date);
}

const standingsMemoryCache = new Map<string, Map<string, { rank: number; points: number | null }>>();

async function getLeagueStandingsMap(leagueCode: string): Promise<Map<string, { rank: number; points: number | null }>> {
  if (standingsMemoryCache.has(leagueCode)) {
    return standingsMemoryCache.get(leagueCode)!;
  }
  const map = new Map<string, { rank: number; points: number | null }>();
  try {
    const res = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${leagueCode}/standings`, {
      signal: AbortSignal.timeout(2000)
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      const entries = data.children?.[0]?.standings?.entries || data.standings?.entries || [];
      for (const e of entries) {
        const rankStat = e.stats?.find((s: any) => s.type === 'rank' || s.name === 'rank');
        const ptsStat = e.stats?.find((s: any) => s.type === 'points' || s.name === 'points');
        const rank = parseInt(rankStat?.value ?? rankStat?.displayValue, 10);
        const points = parseInt(ptsStat?.value ?? ptsStat?.displayValue, 10);
        if (Number.isFinite(rank)) {
          if (e.team?.id) map.set(String(e.team.id), { rank, points: Number.isFinite(points) ? points : null });
          if (e.team?.displayName) map.set(e.team.displayName.toLowerCase(), { rank, points: Number.isFinite(points) ? points : null });
          if (e.team?.name) map.set(e.team.name.toLowerCase(), { rank, points: Number.isFinite(points) ? points : null });
        }
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch standings for ${leagueCode}:`, err);
  }
  standingsMemoryCache.set(leagueCode, map);
  return map;
}

function aggregateStandingsFromCache(): Map<string, { rank: number; points: number }> {
  const aggregatedStandings = new Map<string, { rank: number; points: number | null }>();
  for (const [, sMap] of standingsMemoryCache.entries()) {
    for (const [k, v] of sMap.entries()) {
      aggregatedStandings.set(k, v);
    }
  }
  return aggregatedStandings;
}

async function ensureAllHollywoodbetsStandingsCached(): Promise<Map<string, { rank: number; points: number }>> {
  const CHUNK_SIZE = 8;
  for (let i = 0; i < HOLLYWOODBETS_LEAGUES.length; i += CHUNK_SIZE) {
    const chunk = HOLLYWOODBETS_LEAGUES.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (item) => {
        try {
          await getLeagueStandingsMap(item.code);
        } catch {
          // Keep pipeline resilient on individual network failures
        }
      })
    );
  }
  return aggregateStandingsFromCache();
}

async function getLiveScoreboardFixtures(forceRefresh = false): Promise<LiveFixturesCache> {
  const now = Date.now();
  if (!forceRefresh && fixturesCache && now - new Date(fixturesCache.syncedAt).getTime() < CACHE_TTL_MS) {
    return fixturesCache;
  }

  // Define 15-day dynamic window (yesterday to +14 days) to capture all upcoming gameweeks across Hollywoodbets fixtures
  const startDate = new Date(now - 24 * 60 * 60 * 1000);
  const endDate = new Date(now + 14 * 24 * 60 * 60 * 1000);
  const startStr = startDate.toISOString().slice(0, 10).replace(/-/g, '');
  const endStr = endDate.toISOString().slice(0, 10).replace(/-/g, '');
  const dateParam = `dates=${startStr}-${endStr}`;

  const allFixtures: any[] = [];
  try {
    const CHUNK_SIZE = 8;
    for (let i = 0; i < HOLLYWOODBETS_LEAGUES.length; i += CHUNK_SIZE) {
      const chunk = HOLLYWOODBETS_LEAGUES.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (item) => {
          try {
            const [scoreboardRes, standingsMap] = await Promise.all([
              fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${item.code}/scoreboard?${dateParam}`, {
                signal: AbortSignal.timeout(8000)
              }),
              getLeagueStandingsMap(item.code),
            ]);
            if (!scoreboardRes.ok) return;
            const data = (await scoreboardRes.json()) as any;
            const events = data.events || [];

            for (const ev of events) {
              const comp = ev.competitions?.[0];
              if (!comp) continue;

              const homeComp = comp.competitors?.find((c: any) => c.homeAway === 'home');
              const awayComp = comp.competitors?.find((c: any) => c.homeAway === 'away');
              if (!homeComp || !awayComp) continue;

              const homeTeam = homeComp.team;
              const awayTeam = awayComp.team;
              if (!homeTeam?.displayName || !awayTeam?.displayName) continue;

              // Query authentic standings map first; provider curated ranks are accepted only when present, otherwise rank remains unknown.
              const homeStanding = standingsMap.get(String(homeTeam.id)) || standingsMap.get(homeTeam.displayName.toLowerCase());
              const awayStanding = standingsMap.get(String(awayTeam.id)) || standingsMap.get(awayTeam.displayName.toLowerCase());

              const homeRank = homeStanding?.rank ?? (parseInt(homeComp.curatedRank?.current || '0', 10) || 0);
              const awayRank = awayStanding?.rank ?? (parseInt(awayComp.curatedRank?.current || '0', 10) || 0);

              const homeFormParsed = parseForm(homeComp.form);
              const awayFormParsed = parseForm(awayComp.form);
              const homePoints = homeStanding?.points ?? parsePoints(homeComp.records?.[0]?.summary);
              const awayPoints = awayStanding?.points ?? parsePoints(awayComp.records?.[0]?.summary);

              const homeColor = homeTeam.color ? `#${homeTeam.color}` : '#0284c7';
              const awayColor = awayTeam.color ? `#${awayTeam.color}` : '#dc2626';

              // Provider event does not include H2H; keep those fields explicitly unavailable.
              const kickoffTime = parseProviderKickoff(comp.date || ev.date);
              if (!kickoffTime) continue;

              const fixture = {
                id: `match_${ev.id || `${homeTeam.displayName}_${awayTeam.displayName}`.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
                kickoffTime,
                league: item.name,
                venue: comp.venue?.fullName || 'Unknown Venue',
                round: ev.status?.type?.detail || comp.status?.type?.detail || undefined,
                isHighStakes: Boolean(item.isHighStakes),
                motivation: Number.isFinite(homeRank) && Number.isFinite(awayRank) && (homeRank <= 3 || awayRank <= 3) ? 'title_race' : Number.isFinite(homeRank) && Number.isFinite(awayRank) && (homeRank >= 17 || awayRank >= 17) ? 'relegation_battle' : 'regular',
                homeTeam: {
                  id: `team_${homeTeam.id || homeTeam.abbreviation?.toLowerCase() || 'home'}`,
                  name: homeTeam.displayName,
                  shortName: homeTeam.abbreviation || homeTeam.displayName.slice(0, 3).toUpperCase(),
                  leagueRank: homeRank || null,
                  points: Number.isFinite(homePoints) ? homePoints : null,
                  form: homeFormParsed,
                  avgPossession: null,
                  avgShotsOnTarget: null,
                  isHomeDominant: false,
                  badgeColor: homeColor,
                },
                awayTeam: {
                  id: `team_${awayTeam.id || awayTeam.abbreviation?.toLowerCase() || 'away'}`,
                  name: awayTeam.displayName,
                  shortName: awayTeam.abbreviation || awayTeam.displayName.slice(0, 3).toUpperCase(),
                  leagueRank: awayRank || null,
                  points: Number.isFinite(awayPoints) ? awayPoints : null,
                  form: awayFormParsed,
                  avgPossession: null,
                  avgShotsOnTarget: null,
                  isHomeDominant: false,
                  hasTopTierAwayForm: false,
                  badgeColor: awayColor,
                },
                h2h: {
                  homeWins: null,
                  awayWins: null,
                  draws: null,
                  totalLast5: null,
                  scoresLast5: [],
                },
              };

              fixture.awayTeam.avgPossession = 100 - fixture.homeTeam.avgPossession;
              allFixtures.push(fixture);
            }
          } catch (leagueErr) {
            console.warn(`ESPN scoreboard fetch error for ${item.name}:`, leagueErr);
          }
        })
      );
    }

    if (allFixtures.length > 0) {
      // Read disk dataset to preserve cup tournaments & regional divisions whose rounds fall outside current 14d window
      const diskFixtures = readDiskManifest();

      const normalizeKey = (f: any) => {
        const home = (f.homeTeam?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const away = (f.awayTeam?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const date = (f.kickoffTime || '').slice(0, 10);
        return `${home}_vs_${away}_${date}`;
      };

      const minCutoffDate = getDynamicCutoffIso();
      const mergedMap = new Map<string, any>();
      // 1. First populate disk fixtures (filter out past ghost fixtures older than 48 hours)
      for (const df of diskFixtures) {
        if (!df || !df.id || !df.homeTeam || !df.awayTeam) continue;
        if (df.kickoffTime && df.kickoffTime.slice(0, 10) < minCutoffDate) continue;
        const key = normalizeKey(df);
        mergedMap.set(key, df);
      }

      // 2. Overwrite / append freshly ingested authentic live fixtures, protecting bookmaker-protected fixtures
      for (const lf of allFixtures) {
        if (!lf || !lf.id || !lf.homeTeam || !lf.awayTeam) continue;
        if (lf.kickoffTime && lf.kickoffTime.slice(0, 10) < minCutoffDate) continue;
        const key = normalizeKey(lf);
        const existing = mergedMap.get(key);
        // If the match is bookmaker protected or from Hollywoodbets slate, never overwrite
        if (existing && (existing.isBookmakerProtected || (existing.id && existing.id.startsWith('hollywoodbets_')))) {
          continue;
        }
        mergedMap.set(key, lf);
      }

      const combinedFixtures = Array.from(mergedMap.values())
        .filter(f => !f.kickoffTime || f.kickoffTime.slice(0, 10) >= minCutoffDate);
      combinedFixtures.sort((a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime());

      // Aggregate all standings maps across cached leagues
      const aggregatedStandings = new Map<string, { rank: number; points: number | null }>();
      for (const [, sMap] of standingsMemoryCache.entries()) {
        for (const [k, v] of sMap.entries()) {
          aggregatedStandings.set(k, v);
        }
      }

      // Automatically verify and sanitize all fixtures before persisting or returning to AI
      const { fixtures: validatedFixtures, auditReport } = verifyAndSanitizeFixtures(combinedFixtures, aggregatedStandings);

      writeDiskManifest(validatedFixtures);

      fixturesCache = {
        fixtures: validatedFixtures,
        syncedAt: new Date().toISOString(),
        provider: 'ESPN + configured competition feeds (Sanitized)',
        auditReport,
      };
      return fixturesCache;
    }
  } catch (err) {
    console.warn('Live scoreboard network pass failed, falling back to disk cache:', err);
  }

  // Fallback to disk manifest
  const fallback = readDiskManifest();
  const { fixtures: sanitizedFallback, auditReport: fallbackAudit } = verifyAndSanitizeFixtures(fallback);
  fixturesCache = {
    fixtures: sanitizedFallback,
    syncedAt: new Date().toISOString(),
    provider: 'Disk Manifest (Sanitized)',
    auditReport: fallbackAudit,
  };
  return fixturesCache;
}

// ---------------------------------------------------------------------------
// API-Football powered daily ingestion + settlement pipeline
//
// This is the piece the app never actually had: an automated, server-side
// job (not dependent on a browser tab being open) that (1) loads the day's
// real fixtures and (2) checks yesterday's fixtures against API-Football for
// final scores, writing settled results to disk so predictions get verified
// and the learning engine has real new data to train on.
// ---------------------------------------------------------------------------

const RESULTS_LOG_PATH = path.join(process.cwd(), 'data', 'results-log.json');
const CRON_STATUS_PATH = path.join(process.cwd(), 'data', 'cron-status.json');

interface SettledResultEntry {
  id: string;
  fixture: any;
  homeScore: number;
  awayScore: number;
  actualOutcome: 'home' | 'draw' | 'away';
  date: string;
  notes?: string;
  settledAt: string;
}

function readResultsLog(): SettledResultEntry[] {
  ensureDataDirectory();
  try {
    if (fs.existsSync(RESULTS_LOG_PATH)) {
      const data = JSON.parse(fs.readFileSync(RESULTS_LOG_PATH, 'utf-8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.warn('Error reading results-log.json:', e);
  }
  return [];
}

function writeResultsLog(entries: SettledResultEntry[]): void {
  ensureDataDirectory();
  try {
    fs.writeFileSync(RESULTS_LOG_PATH, JSON.stringify(entries, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing results-log.json:', e);
  }
}

// ---------------------------------------------------------------------------
// Prediction log: freeze predictions before kickoff, record outcomes afterwards.
// See src/services/predictionLog.ts for the rules (append-only, hash-chained).
// Set PREDICTION_LOG_PATH to a persistent volume if the app's disk is ephemeral.
// ---------------------------------------------------------------------------
const PREDICTION_LOG_PATH = process.env.PREDICTION_LOG_PATH?.trim()
  || path.join(process.cwd(), 'data', 'prediction-log.jsonl');
const PREDICTION_MIN_SAMPLE = Math.max(1, Number(process.env.PREDICTION_MIN_SAMPLE || 30));
const PREDICTION_HORIZON_HOURS = Math.max(1, Number(process.env.PREDICTION_HORIZON_HOURS || 72));

function currentEngineWeights() {
  try {
    const f = path.join(process.cwd(), 'data', 'persisted_learning_state.json');
    if (fs.existsSync(f)) {
      const st = JSON.parse(fs.readFileSync(f, 'utf-8'));
      if (st && st.weights) return sanitizeEngineWeights(st.weights);
    }
  } catch {
    /* fall through to defaults */
  }
  return sanitizeEngineWeights(undefined);
}

function runPredictionFreezeJob(now: number = Date.now()) {
  const summary = { appended: 0, duplicate: 0, late: 0, invalid: 0, errors: 0, considered: 0 };
  try {
    const weights = currentEngineWeights();
    const modelVersion =
      `${process.env.GIT_SHA?.slice(0, 12) || 'local'}+w${createHash('sha256').update(JSON.stringify(weights)).digest('hex').slice(0, 10)}`;
    const horizonMs = PREDICTION_HORIZON_HOURS * 3_600_000;

    for (const f of readRawDiskManifest()) {
      const kickoff = Date.parse(f?.kickoffTime);
      if (!f?.id || !Number.isFinite(kickoff) || kickoff <= now || kickoff > now + horizonMs) continue;
      summary.considered++;
      try {
        const p = evaluateFixturePrediction(f, 'none', weights);
        if (!p) { summary.invalid++; continue; }
        const r = appendPrediction(PREDICTION_LOG_PATH, {
          fixtureId: String(f.id),
          kickoffTime: new Date(kickoff).toISOString(),
          league: String(f.league || ''),
          homeTeam: String(f.homeTeam?.name || ''),
          awayTeam: String(f.awayTeam?.name || ''),
          probabilities: { home: p.homeWinPct, draw: p.drawPct, away: p.awayWinPct },
          predicted: p.predictedWinner,
          modelVersion,
          inputCoverage: computeInputCoverage(f),
        }, now);
        if (r.status === 'appended') summary.appended++;
        else if (r.status === 'duplicate') summary.duplicate++;
        else if (r.status === 'late') summary.late++;
        else summary.invalid++;
      } catch (e) {
        summary.errors++;
        console.warn('[prediction-log] could not predict fixture', f?.id, e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    summary.errors++;
    console.error('[prediction-log] freeze job failed:', e);
  }
  if (summary.appended > 0 || summary.errors > 0) console.log('[prediction-log] freeze', JSON.stringify(summary));
  return summary;
}

/** Copy settled results into the prediction log for predictions that have no outcome yet. Idempotent. */
function reconcilePredictionOutcomes(now: number = Date.now()) {
  let appended = 0;
  try {
    for (const e of readResultsLog()) {
      if (!e?.id) continue;
      const r = appendOutcome(PREDICTION_LOG_PATH, { fixtureId: String(e.id), homeScore: e.homeScore, awayScore: e.awayScore }, now);
      if (r.status === 'appended') appended++;
    }
  } catch (err) {
    console.error('[prediction-log] outcome reconciliation failed:', err);
  }
  if (appended > 0) console.log(`[prediction-log] recorded ${appended} outcome(s)`);
  return appended;
}

interface CronStatus {
  ingest: {
    lastRunAt: string | null;
    lastSuccess: boolean | null;
    lastMessage: string;
    fixturesIngested: number;
    sourceUsed?: 'SPORTAPI_AI' | 'THERUNDOWN' | null;
  };
  settlement: {
    lastRunAt: string | null;
    lastSuccess: boolean | null;
    lastMessage: string;
    resultsSettled: number;
  };
}

function readCronStatus(): CronStatus {
  ensureDataDirectory();
  const empty: CronStatus = {
    ingest: { lastRunAt: null, lastSuccess: null, lastMessage: 'Not yet run', fixturesIngested: 0 },
    settlement: { lastRunAt: null, lastSuccess: null, lastMessage: 'Not yet run', resultsSettled: 0 },
  };
  try {
    if (fs.existsSync(CRON_STATUS_PATH)) {
      return { ...empty, ...JSON.parse(fs.readFileSync(CRON_STATUS_PATH, 'utf-8')) };
    }
  } catch (e) {
    console.warn('Error reading cron-status.json:', e);
  }
  return empty;
}

function writeCronStatus(status: CronStatus): void {
  ensureDataDirectory();
  try {
    fs.writeFileSync(CRON_STATUS_PATH, JSON.stringify(status, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing cron-status.json:', e);
  }
}

function parseProviderKickoff(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(' ', 'T');
  if (!normalized || !/(Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) return null;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function normalizeTeamName(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Build an internal fixture record from a SportAPI.ai fixture. */
function mapSportApiAiToInternalFixture(f: any): any {
  const homeName = f.home_team?.name || f.homeTeam?.name || (typeof f.home_team === 'string' ? f.home_team : '');
  const awayName = f.away_team?.name || f.awayTeam?.name || (typeof f.away_team === 'string' ? f.away_team : '');
  if (!homeName || !awayName) return null;
  const idStr = String(f.id || `${homeName}_${awayName}`);

  const kickoffTime = parseProviderKickoff(f.datetime) || parseProviderKickoff(f.kickoff_time);
  if (!kickoffTime) return null;

  const leagueName = f.league_name
    ? `${f.league_zone || f.league_geo || 'Global'} • ${f.league_name}`
    : (typeof f.league === 'string' ? f.league : `${f.league?.country || 'Global'} • ${f.league?.name || 'League'}`);

  // Parse odds if available from SportAPI object strictly for market display/odds comparisons
  const homeOdds = Number(f.home_odds || f.odds?.home || f.odds?.home_win || f.homeOdds);
  const awayOdds = Number(f.away_odds || f.odds?.away || f.odds?.away_win || f.awayOdds);
  const drawOdds = Number(f.draw_odds || f.odds?.draw || f.drawOdds);

  return {
    id: `sportapiai_${idStr}`,
    sportApiAiFixtureId: idStr,
    automationSource: 'SPORTAPI_AI',
    kickoffTime,
    league: leagueName,
    venue: f.venue?.name || f.venue || 'Unknown Venue',
    round: f.stage || f.league?.round || f.round || 'Unknown Round',
    isHighStakes: false,
    motivation: 'regular',
    odds: (Number.isFinite(homeOdds) && Number.isFinite(awayOdds) && homeOdds > 1.05 && awayOdds > 1.05)
      ? {
          home: homeOdds,
          draw: (Number.isFinite(drawOdds) && drawOdds > 1.05) ? drawOdds : undefined,
          away: awayOdds,
          provider: 'SportAPI.ai',
        }
      : undefined,
    homeTeam: {
      id: `sportapiai_team_${f.home_id || f.home_team?.id || f.homeTeam?.id || normalizeTeamName(homeName)}`,
      name: homeName,
      shortName: (f.home_short || homeName).slice(0, 3).toUpperCase(),
      leagueRank: null,
      points: null,
      form: [],
      avgPossession: null,
      avgShotsOnTarget: null,
      isHomeDominant: false,
      badgeColor: '#2563eb',
    },
    awayTeam: {
      id: `sportapiai_team_${f.away_id || f.away_team?.id || f.awayTeam?.id || normalizeTeamName(awayName)}`,
      name: awayName,
      shortName: (f.away_short || awayName).slice(0, 3).toUpperCase(),
      leagueRank: null,
      points: null,
      form: [],
      avgPossession: null,
      avgShotsOnTarget: null,
      hasTopTierAwayForm: false,
      badgeColor: '#dc2626',
    },
    h2h: { homeWins: 0, draws: 0, awayWins: 0, totalLast5: 0, scoresLast5: [] },

  };
}

/** Build an internal fixture record from a TheRundown soccer event. */
function mapTheRundownToInternalFixture(ev: any): any {
  const teams = ev.teams_normalized || ev.teams || [];
  const home = teams.find((t: any) => t.is_home) || teams[0];
  const away = teams.find((t: any) => t.is_away) || teams[1];
  const homeName = home?.name || '';
  const awayName = away?.name || '';
  if (!home || !away || !homeName || !awayName) return null;
  const idStr = String(ev.event_id || `${homeName}_${awayName}`);
  const kickoffTime = parseProviderKickoff(ev.event_date);
  if (!kickoffTime) return null;
  const leagueName = ev.country ? `${ev.country} • ${ev.leagueName}` : (ev.leagueName || 'Premier Soccer');

  return {
    id: `therundown_${idStr}`,
    theRundownEventId: idStr,
    automationSource: 'THERUNDOWN',
    kickoffTime,
    league: leagueName,
    venue: 'Unknown Venue',
    round: 'Unknown Round',
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: {
      id: `rundown_team_${home.team_id || normalizeTeamName(homeName)}`,
      name: homeName,
      shortName: homeName.slice(0, 3).toUpperCase(),
      leagueRank: null,
      points: null,
      form: [],
      avgPossession: null,
      avgShotsOnTarget: null,
      isHomeDominant: false,
      badgeColor: '#2563eb',
    },
    awayTeam: {
      id: `rundown_team_${away.team_id || normalizeTeamName(awayName)}`,
      name: awayName,
      shortName: awayName.slice(0, 3).toUpperCase(),
      leagueRank: null,
      points: null,
      form: [],
      avgPossession: null,
      avgShotsOnTarget: null,
      hasTopTierAwayForm: false,
      badgeColor: '#dc2626',
    },
    h2h: { homeWins: 0, draws: 0, awayWins: 0, totalLast5: 0, scoresLast5: [] },

  };
}

/**
 * Daily ingestion job: pulls today's real fixtures from SportAPI.ai (primary)
 * or TheRundown (secondary) and merges them into the disk manifest, without
 * overwriting any existing Hollywoodbets slate entries.
 */
async function runDailyIngestJob(): Promise<{ success: boolean; message: string; count: number }> {
  const status = readCronStatus();
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  let mapped: any[] = [];
  let sourceUsed: 'SPORTAPI_AI' | 'THERUNDOWN' | null = null;
  let primaryError: string | null = null;

  // 1. Try SportAPI.ai first (Primary: 100+ global leagues)
  if (sportApiAiConfigured()) {
    try {
      const rawFixtures = await fetchSportApiAiFixturesByDate(dateStr);
      if (rawFixtures && rawFixtures.length > 0) {
        mapped = rawFixtures.map(mapSportApiAiToInternalFixture).filter(Boolean);
        sourceUsed = 'SPORTAPI_AI';
      }
    } catch (err: unknown) {
      primaryError = err instanceof Error ? err.message : 'Unknown SportAPI.ai error';
      console.warn(`[cron:ingest] SportAPI.ai failed, attempting TheRundown: ${primaryError}`);
    }
  } else {
    primaryError = 'SPORTAPI_AI_KEY not configured';
  }

  // 2. Fall back to TheRundown if SportAPI.ai was not configured or produced zero/error
  if (mapped.length === 0 && theRundownConfigured()) {
    try {
      const rundownEvents = await fetchAllTheRundownSoccerEvents(dateStr);
      if (rundownEvents && rundownEvents.length > 0) {
        mapped = rundownEvents.map(mapTheRundownToInternalFixture).filter(Boolean);
        sourceUsed = 'THERUNDOWN';
      }
    } catch (err: unknown) {
      const rundownErr = err instanceof Error ? err.message : 'Unknown TheRundown error';
      const msg = `Both providers failed. SportAPI.ai: ${primaryError}. TheRundown: ${rundownErr}`;
      status.ingest = { lastRunAt: new Date().toISOString(), lastSuccess: false, lastMessage: msg, fixturesIngested: 0, sourceUsed: null };
      writeCronStatus(status);
      console.error(`[cron:ingest] ${msg}`);
      return { success: false, message: msg, count: 0 };
    }
  }

  if (mapped.length === 0) {
    const msg = `No automated fixtures ingested. SportAPI.ai: ${primaryError || 'no fixtures'}. TheRundown: ${theRundownConfigured() ? 'no fixtures returned' : 'THERUNDOWN_KEY not configured'}.`;
    status.ingest = { lastRunAt: new Date().toISOString(), lastSuccess: false, lastMessage: msg, fixturesIngested: 0, sourceUsed: null };
    writeCronStatus(status);
    console.warn(`[cron:ingest] ${msg}`);
    return { success: false, message: msg, count: 0 };
  }

  try {
    const diskFixtures = readDiskManifest();
    const normalizeKey = (f: any) => {
      const home = normalizeTeamName(f.homeTeam?.name);
      const away = normalizeTeamName(f.awayTeam?.name);
      const date = (f.kickoffTime || '').slice(0, 10);
      return `${home}_vs_${away}_${date}`;
    };

    const mergedMap = new Map<string, any>();
    for (const df of diskFixtures) {
      mergedMap.set(normalizeKey(df), df);
    }
    let newCount = 0;
    for (const mf of mapped) {
      const key = normalizeKey(mf);
      const existing = mergedMap.get(key);
      // Never clobber a Hollywoodbets-sourced or bookmaker-protected entry
      if (existing && (existing.isBookmakerProtected || (existing.id && existing.id.startsWith('hollywoodbets_')))) {
        if (!existing.sportApiAiFixtureId && mf.sportApiAiFixtureId) existing.sportApiAiFixtureId = mf.sportApiAiFixtureId;
        if (!existing.theRundownEventId && mf.theRundownEventId) existing.theRundownEventId = mf.theRundownEventId;
        continue;
      }
      if (!existing) newCount++;
      mergedMap.set(key, mf);
    }

    const combined = Array.from(mergedMap.values());
    writeDiskManifest(combined);
    fixturesCache = null; // invalidate in-memory cache so next read picks up new data

    const sourceLabel = sourceUsed === 'SPORTAPI_AI' ? 'SportAPI.ai' : 'TheRundown.io';
    const msg = `Ingested ${mapped.length} fixtures from ${sourceLabel} for ${dateStr} (${newCount} new).`;
    status.ingest = { lastRunAt: new Date().toISOString(), lastSuccess: true, lastMessage: msg, fixturesIngested: mapped.length, sourceUsed };
    writeCronStatus(status);
    console.log(`[cron:ingest] ${msg}`);
    return { success: true, message: msg, count: mapped.length };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown ingestion error';
    status.ingest = { lastRunAt: new Date().toISOString(), lastSuccess: false, lastMessage: msg, fixturesIngested: 0, sourceUsed };
    writeCronStatus(status);
    console.error(`[cron:ingest] FAILED: ${msg}`);
    return { success: false, message: msg, count: 0 };
  }
}

/**
 * Settlement job: finds fixtures in the manifest whose kickoff has passed and
 * that haven't been settled yet, checks their real result via SportAPI.ai
 * (primary) or TheRundown (secondary), and appends finished ones to
 * data/results-log.json.
 */
async function runSettlementJob(): Promise<{ success: boolean; message: string; count: number }> {
  const status = readCronStatus();

  try {
    const now = Date.now();
    const manifest = readRawDiskManifest();
    const existingLog = readResultsLog();
    const settledIds = new Set(existingLog.map((e) => e.id));

    // Candidates: kickoff already passed, not already settled.
    const pastFixtures = manifest.filter((f: any) => {
      if (!f.kickoffTime) return false;
      if (settledIds.has(f.id)) return false;
      return new Date(f.kickoffTime).getTime() < now;
    });

    if (pastFixtures.length === 0) {
      reconcilePredictionOutcomes(); // catch results logged earlier but not yet copied into the prediction log
      const msg = 'No outstanding finished fixtures to settle.';
      status.settlement = { lastRunAt: new Date().toISOString(), lastSuccess: true, lastMessage: msg, resultsSettled: 0 };
      writeCronStatus(status);
      return { success: true, message: msg, count: 0 };
    }

    const settlementLookbackDays = Math.max(7, Number(process.env.SETTLEMENT_LOOKBACK_DAYS || 30));
    const cutoffMs = now - settlementLookbackDays * 24 * 60 * 60 * 1000;
    const eligiblePastFixtures = pastFixtures.filter((f: any) => {
      const kickoffMs = new Date(f.kickoffTime).getTime();
      return Number.isFinite(kickoffMs) && kickoffMs >= cutoffMs;
    });

    // Group eligible past fixtures by kickoff date.
    const dateGroups = new Map<string, any[]>();
    for (const f of eligiblePastFixtures) {
      const d = (f.kickoffTime || '').slice(0, 10);
      if (!d) continue;
      if (!dateGroups.has(d)) dateGroups.set(d, []);
      dateGroups.get(d)!.push(f);
    }

    const allowedDates = new Set(
      Array.from({ length: settlementLookbackDays + 1 }, (_, i) =>
        new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      )
    );
    let settledCount = 0;
    const newEntries: SettledResultEntry[] = [];

    for (const [dateStr, fixturesForDate] of dateGroups.entries()) {
      if (!allowedDates.has(dateStr)) continue;

      let dateSettled = false;

      // 1. Try SportAPI.ai settlement
      if (sportApiAiConfigured()) {
        try {
          const apiFixtures = await fetchSportApiAiFixturesByDate(dateStr);
          const byIdMap = new Map<string, any>();
          const byNameMap = new Map<string, any>();

          for (const af of apiFixtures) {
            if (af.id) byIdMap.set(String(af.id), af);
            const home = af.home_team?.name || af.homeTeam?.name || '';
            const away = af.away_team?.name || af.awayTeam?.name || '';
            if (home && away) {
              byNameMap.set(`${normalizeTeamName(home)}_vs_${normalizeTeamName(away)}`, af);
            }
          }

          for (const f of fixturesForDate) {
            let match = f.sportApiAiFixtureId ? byIdMap.get(String(f.sportApiAiFixtureId)) : undefined;
            if (!match) {
              const key = `${normalizeTeamName(f.homeTeam?.name)}_vs_${normalizeTeamName(f.awayTeam?.name)}`;
              match = byNameMap.get(key);
            }

            if (!match || !isSportApiAiFixtureFinished(match)) continue;
            const scoreInfo = getSportApiAiScores(match);
            if (!scoreInfo.outcome || scoreInfo.home === null || scoreInfo.away === null) continue;

            newEntries.push({
              id: f.id,
              fixture: f,
              homeScore: scoreInfo.home,
              awayScore: scoreInfo.away,
              actualOutcome: scoreInfo.outcome,
              date: dateStr,
              notes: 'Settled via SportAPI.ai',
              settledAt: new Date().toISOString(),
            });
            settledCount++;
          }
          dateSettled = true;
        } catch (err) {
          console.warn(`[cron:settlement] SportAPI.ai settlement failed for ${dateStr}:`, err);
        }
      }

      // 2. Try TheRundown as fallback for remaining unsettled
      if (!dateSettled && theRundownConfigured()) {
        try {
          const rundownEvents = await fetchAllTheRundownSoccerEvents(dateStr);
          const byIdMap = new Map<string, any>();
          const byNameMap = new Map<string, any>();

          for (const ev of rundownEvents) {
            if (ev.event_id) byIdMap.set(String(ev.event_id), ev);
            const teams = ev.teams_normalized || ev.teams || [];
            const home = teams.find((t: any) => t.is_home) || teams[0];
            const away = teams.find((t: any) => t.is_away) || teams[1];
            if (home?.name && away?.name) {
              byNameMap.set(`${normalizeTeamName(home.name)}_vs_${normalizeTeamName(away.name)}`, ev);
            }
          }

          for (const f of fixturesForDate) {
            if (newEntries.some((e) => e.id === f.id)) continue;
            let match = f.theRundownEventId ? byIdMap.get(String(f.theRundownEventId)) : undefined;
            if (!match) {
              const key = `${normalizeTeamName(f.homeTeam?.name)}_vs_${normalizeTeamName(f.awayTeam?.name)}`;
              match = byNameMap.get(key);
            }

            if (!match || !isTheRundownEventFinished(match)) continue;
            const scoreInfo = getTheRundownScores(match);
            if (!scoreInfo.outcome || scoreInfo.home === null || scoreInfo.away === null) continue;

            newEntries.push({
              id: f.id,
              fixture: f,
              homeScore: scoreInfo.home,
              awayScore: scoreInfo.away,
              actualOutcome: scoreInfo.outcome,
              date: dateStr,
              notes: 'Settled via TheRundown.io',
              settledAt: new Date().toISOString(),
            });
            settledCount++;
          }
        } catch (err) {
          console.warn(`[cron:settlement] TheRundown settlement failed for ${dateStr}:`, err);
        }
      }
    }

    if (newEntries.length > 0) {
      writeResultsLog([...existingLog, ...newEntries]);
    }
    reconcilePredictionOutcomes();

    const msg = `Settled ${settledCount} of ${pastFixtures.length} unsettled past fixtures.`;
    status.settlement = { lastRunAt: new Date().toISOString(), lastSuccess: true, lastMessage: msg, resultsSettled: settledCount };
    writeCronStatus(status);
    console.log(`[cron:settlement] ${msg}`);
    return { success: true, message: msg, count: settledCount };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown settlement error';
    console.error(`[cron:settlement] FAILED: ${msg}`);
    status.settlement = { lastRunAt: new Date().toISOString(), lastSuccess: false, lastMessage: msg, resultsSettled: 0 };
    writeCronStatus(status);
    return { success: false, message: msg, count: 0 };
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Factory Baseline Weights for self-healing server-side sanitization
  const DEFAULT_SERVER_WEIGHTS: Record<string, number> = {
    stakesMotivationBoost: 2.5,
    deadRubberPenalty: 0.20,
    rankPointsMultiplier: 0.40,
    formWinPoints: 1.20,
    formDrawPoints: 0.40,
    homeAdvantageBaseline: 9.4,
    awayAdvantageBaseline: 8.8,
    homeDominanceBonus: 0.15,
    awayFormBonus: 1.5,
    tacticalPossessionWeight: 0.15,
    tacticalShotsWeight: 0.45,
    h2hMultiplier: 6.0,
    fatiguePenaltyRate: 0.15,
    volatilityDrawBoost: 0.68,
    favouriteWinFloor: 55,
    drawEquilibriumMargin: 4.0,
    drawEquilibriumBoost: 38.0,
    lastSeasonStandingWeight: 0.30,
    squadValueWeight: 0.40,
    matchRatingWeight: 4.50,
    lowTotalDrawBoost: 1.25,
    defensiveSynergyDrawWeight: 0.35,
    leagueClusterWeight: 0.40,
    xgWeight: 0.50,
    absencePenaltyRate: 0.12,
  };

  function sanitizeServerWeights(weights: any): Record<string, number> {
    const sanitized: Record<string, number> = { ...DEFAULT_SERVER_WEIGHTS };
    if (weights && typeof weights === 'object') {
      for (const k of Object.keys(DEFAULT_SERVER_WEIGHTS)) {
        const v = weights[k];
        if (typeof v === 'number' && Number.isFinite(v) && !isNaN(v)) {
          sanitized[k] = v;
        }
      }
    }
    return sanitized;
  }

  // ---- Learning-state write guard -------------------------------------
  // The server is the sole authority over persisted_learning_state.json.
  // Clients may not raise the epoch count (i.e. train) unless the operator
  // has explicitly started the server with ALLOW_LEARNING_TRAINING=1.
  const LEARNING_STATE_PATH = path.join(process.cwd(), 'data', 'persisted_learning_state.json');
  const LEARNING_BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');

  function readDiskLearningState(): any | null {
    try {
      if (!fs.existsSync(LEARNING_STATE_PATH)) return null;
      return JSON.parse(fs.readFileSync(LEARNING_STATE_PATH, 'utf-8'));
    } catch {
      return null;
    }
  }

  // Copy the current file aside BEFORE any overwrite, so nothing under
  // audit can silently disappear.
  function snapshotLearningState(reason: string): string | null {
    try {
      if (!fs.existsSync(LEARNING_STATE_PATH)) return null;
      fs.mkdirSync(LEARNING_BACKUP_DIR, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const tag = reason.replace(/[^a-zA-Z0-9_-]/g, '_');
      const name = `prewrite_${tag}_${ts}.json`;
      fs.copyFileSync(LEARNING_STATE_PATH, path.join(LEARNING_BACKUP_DIR, name));
      return name;
    } catch (err) {
      console.error('Snapshot before learning-state write failed:', err);
      return null;
    }
  }

  // Temp file + rename so a crash never leaves a half-written state file.
  function writeLearningStateAtomic(state: unknown): void {
    fs.mkdirSync(path.dirname(LEARNING_STATE_PATH), { recursive: true });
    const tmp = `${LEARNING_STATE_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tmp, LEARNING_STATE_PATH);
  }

  // Durable Persistence: Get Learned Model State
  app.get('/api/learning-state', (_req, res) => {
    try {
      const filePath = path.join(process.cwd(), 'data', 'persisted_learning_state.json');
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const state = JSON.parse(raw);
        if (state && state.weights) {
          state.weights = sanitizeServerWeights(state.weights);
          state.baselineWeights = sanitizeServerWeights(state.baselineWeights);
          // Invalid persisted performance metrics are left unavailable; the client recomputes measured holdout metrics.
        }
        return res.json({ status: 'ok', state, source: 'server_disk' });
      }
      return res.json({ status: 'not_found' });
    } catch (err) {
      console.error('Failed to read persisted learning state:', err);
      return res.status(500).json({ status: 'error', message: 'Failed to read persisted state' });
    }
  });

  // Durable Persistence: Save Learned Model State
  app.post('/api/learning-state', requireAdmin, (req, res) => {
    try {
      const { state } = req.body;
      if (!state || !state.weights) {
        return res.status(400).json({ status: 'error', message: 'Invalid learning state provided' });
      }

      const allowTraining = process.env.ALLOW_LEARNING_TRAINING === '1';
      const disk = readDiskLearningState();
      const diskEpochs = Number.isFinite(disk?.totalEpochsTrained) ? disk.totalEpochsTrained : 0;
      const incomingEpochs = Number(state.totalEpochsTrained);

      if (!Number.isFinite(incomingEpochs) || incomingEpochs < 0) {
        return res.status(400).json({ status: 'error', message: 'Invalid totalEpochsTrained' });
      }

      // Reject any client write that would advance training past what the
      // server has on disk (stale tabs, old bundles, manual dashboard runs).
      if (!allowTraining && incomingEpochs > diskEpochs) {
        console.warn(
          `Rejected learning-state write: incoming epochs ${incomingEpochs} > disk ${diskEpochs}`
        );
        return res.status(409).json({
          status: 'rejected',
          message: 'Server-owned learning state: training writes are disabled',
          diskEpochs,
          incomingEpochs,
        });
      }

      state.weights = sanitizeServerWeights(state.weights);
      state.baselineWeights = sanitizeServerWeights(state.baselineWeights);
      if (!allowTraining) state.isAutoLearningEnabled = false;
      // Never synthesize performance metrics during persistence. Invalid metrics remain unavailable.

      // Only snapshot when the write actually changes something material,
      // so routine identical saves don't flood data/backups.
      const changed =
        !disk ||
        diskEpochs !== incomingEpochs ||
        JSON.stringify(disk.weights) !== JSON.stringify(state.weights);
      if (changed) snapshotLearningState('client_post');
      writeLearningStateAtomic(state);

      return res.json({
        status: 'saved',
        timestamp: new Date().toISOString(),
        epochsTrained: state.totalEpochsTrained,
        accuracyPct: state.accuracyPct,
      });
    } catch (err) {
      console.error('Failed to save persisted learning state:', err);
      return res.status(500).json({ status: 'error', message: 'Failed to write persisted state' });
    }
  });

  // Durable Persistence: Create Snapshot Backup
  app.post('/api/learning-state/backup', requireAdmin, (req, res) => {
    try {
      const { state, tag } = req.body;
      const backupDir = path.join(process.cwd(), 'data', 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const cleanTag = (tag || 'snapshot').replace(/[^a-zA-Z0-9_-]/g, '_');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `backup_${cleanTag}_${timestamp}.json`;
      const filePath = path.join(backupDir, filename);

      const payload = {
        backedUpAt: new Date().toISOString(),
        state: state || null,
      };

      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');

      return res.json({
        status: 'backed_up',
        filename,
        timestamp: payload.backedUpAt,
      });
    } catch (err) {
      console.error('Failed to create backup:', err);
      return res.status(500).json({ status: 'error', message: 'Failed to create backup' });
    }
  });

  // Durable Persistence: List Available Backups
  app.get('/api/learning-state/backups', (_req, res) => {
    try {
      const backupDir = path.join(process.cwd(), 'data', 'backups');
      if (!fs.existsSync(backupDir)) {
        return res.json({ status: 'ok', backups: [] });
      }

      const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.json'));
      const backups = files.map((filename) => {
        const stats = fs.statSync(path.join(backupDir, filename));
        return {
          filename,
          sizeBytes: stats.size,
          createdAt: stats.birthtime.toISOString(),
        };
      }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return res.json({ status: 'ok', backups });
    } catch (err) {
      console.error('Failed to list backups:', err);
      return res.status(500).json({ status: 'error', message: 'Failed to list backups' });
    }
  });

  // Durable Persistence: Restore a Specific Backup
  app.post('/api/learning-state/restore', requireAdmin, (req, res) => {
    try {
      const { filename } = req.body;
      if (!filename || typeof filename !== 'string') {
        return res.status(400).json({ status: 'error', message: 'Filename required' });
      }

      const backupDir = path.join(process.cwd(), 'data', 'backups');
      const backupPath = path.join(backupDir, path.basename(filename));

      if (!fs.existsSync(backupPath)) {
        return res.status(404).json({ status: 'error', message: 'Backup file not found' });
      }

      const raw = fs.readFileSync(backupPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const stateToRestore = parsed.state || parsed;

      if (!stateToRestore || !stateToRestore.weights) {
        return res.status(400).json({ status: 'error', message: 'Backup contains no learning state' });
      }
      stateToRestore.weights = sanitizeServerWeights(stateToRestore.weights);
      stateToRestore.baselineWeights = sanitizeServerWeights(stateToRestore.baselineWeights);
      if (process.env.ALLOW_LEARNING_TRAINING !== '1') stateToRestore.isAutoLearningEnabled = false;

      snapshotLearningState('pre_restore');
      writeLearningStateAtomic(stateToRestore);

      return res.json({
        status: 'restored',
        state: stateToRestore,
        restoredFrom: filename,
      });
    } catch (err) {
      console.error('Failed to restore backup:', err);
      return res.status(500).json({ status: 'error', message: 'Failed to restore backup' });
    }
  });

  // Live Fixtures Provider API endpoint
  app.get('/api/fixtures/live', async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const liveData = await getLiveScoreboardFixtures(forceRefresh);

      return res.json({
        status: 'success',
        provider: liveData.provider,
        count: liveData.fixtures.length,
        syncedAt: liveData.syncedAt,
        isLive: true,
        fixtures: liveData.fixtures,
        auditReport: liveData.auditReport,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch live fixtures';
      return res.status(500).json({ status: 'error', message: msg });
    }
  });

  // Automated Data Authenticity & Verification Audit Endpoint
  app.get('/api/fixtures/verify', async (_req, res) => {
    try {
      const liveData = await getLiveScoreboardFixtures(false);
      const aggregatedStandings = new Map<string, { rank: number; points: number }>();
      for (const [, sMap] of standingsMemoryCache.entries()) {
        for (const [k, v] of sMap.entries()) {
          aggregatedStandings.set(k, v);
        }
      }

      const { fixtures: validatedFixtures, auditReport } = verifyAndSanitizeFixtures(
        liveData.fixtures,
        aggregatedStandings
      );

      return res.json({
        status: 'success',
        timestamp: new Date().toISOString(),
        auditReport,
        totalFixtures: validatedFixtures.length,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification audit failed';
      return res.status(500).json({ status: 'error', message: msg });
    }
  });

  // Verify and Sanitize Arbitrary Payload
  app.post('/api/fixtures/verify', requireAdmin, async (req, res) => {
    try {
      const { fixtures } = req.body || {};
      if (!Array.isArray(fixtures)) {
        return res.status(400).json({ status: 'error', message: 'fixtures array expected in body' });
      }

      const aggregatedStandings = new Map<string, { rank: number; points: number }>();
      for (const [, sMap] of standingsMemoryCache.entries()) {
        for (const [k, v] of sMap.entries()) {
          aggregatedStandings.set(k, v);
        }
      }

      const { fixtures: validatedFixtures, auditReport } = verifyAndSanitizeFixtures(
        fixtures,
        aggregatedStandings
      );

      return res.json({
        status: 'success',
        auditReport,
        fixtures: validatedFixtures,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Payload verification failed';
      return res.status(500).json({ status: 'error', message: msg });
    }
  });

  // 1. GET /api/fixtures/persisted: Reads and returns all disk-stored fixtures from data/fixtures-manifest.json
  app.get('/api/fixtures/persisted', (_req, res) => {
    try {
      const diskData = readDiskManifest();
      const { fixtures: validated, auditReport } = verifyAndSanitizeFixtures(diskData);
      return res.json({
        status: 'success',
        count: validated.length,
        syncedAt: new Date().toISOString(),
        provider: 'Server Disk Manifest (data/fixtures-manifest.json)',
        auditReport,
        fixtures: validated,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to read persisted fixtures';
      return res.status(500).json({ status: 'error', message: msg });
    }
  });

  // Daily Hollywoodbets and Master Slate Endpoint
  app.get('/api/fixtures/daily-slate', (_req, res) => {
    try {
      const diskData = readDiskManifest();
      const { fixtures: validated } = verifyAndSanitizeFixtures(diskData);
      return res.json({
        status: 'success',
        count: validated.length,
        syncedAt: new Date().toISOString(),
        fixtures: validated,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load daily slate';
      return res.status(500).json({ status: 'error', message: msg });
    }
  });

  // Shared merge-into-manifest logic, extracted so every ingestion path (paste-text,
  // PDF upload, URL fetch) goes through the exact same real, working pipeline —
  // rather than each having its own parallel, partially-broken implementation.
  const ingestFixturesIntoManifest = async (incomingFixtures: any[], sourceIsVerifiedBookmaker = false) => {
    const diskFixtures = readDiskManifest();

    const normalizeKey = (f: any) => {
      const home = (f.homeTeam?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const away = (f.awayTeam?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const date = (f.kickoffTime || '').slice(0, 10);
      return `${home}_vs_${away}_${date}`;
    };

    const mergedMap = new Map<string, any>();
    for (const df of diskFixtures) {
      if (!df || !df.id || !df.homeTeam || !df.awayTeam) continue;
      mergedMap.set(normalizeKey(df), df);
    }
    for (const hf of incomingFixtures) {
      if (!hf || !hf.id || !hf.homeTeam || !hf.awayTeam) continue;
      const protectedFixture = { ...hf, isBookmakerProtected: sourceIsVerifiedBookmaker };
      mergedMap.set(normalizeKey(hf), protectedFixture);
    }

    const minDate = getDynamicCutoffIso();
    const combined = Array.from(mergedMap.values()).filter(
      (f: any) => !f.kickoffTime || f.kickoffTime.slice(0, 10) >= minDate
    );
    combined.sort((a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime());

    // Proactively populate and merge authentic standings from ESPN cache
    const aggregatedStandings = await ensureAllHollywoodbetsStandingsCached();

    const { fixtures: validatedFixtures, auditReport } = verifyAndSanitizeFixtures(combined, aggregatedStandings);
    writeDiskManifest(validatedFixtures);
    fixturesCache = {
      fixtures: validatedFixtures,
      syncedAt: new Date().toISOString(),
      provider: 'Hollywoodbets Ingested Live Sheet (Disk Persisted)',
      auditReport,
    };
    return { validatedFixtures, auditReport };
  };

  // 2. POST /api/fixtures/ingest-slate (and alias /api/fixtures/ingest-hollywoodbets):
  // Atomically deduplicates and commits user-imported slates directly to data/fixtures-manifest.json
  const handleIngestSlate = async (req: express.Request, res: express.Response) => {
    try {
      const { rawText, fixtures } = req.body || {};
      let incomingFixtures: any[] = [];

      if (rawText && typeof rawText === 'string') {
        incomingFixtures = parseHollywoodbetsRawText(rawText);
      } else if (Array.isArray(fixtures)) {
        incomingFixtures = fixtures;
      }

      if (!incomingFixtures || incomingFixtures.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No valid fixtures provided or text could not be parsed.',
        });
      }

      const { validatedFixtures, auditReport } = await ingestFixturesIntoManifest(incomingFixtures, Boolean(rawText && typeof rawText === 'string'));

      return res.json({
        status: 'success',
        message: `Successfully ingested and saved ${incomingFixtures.length} bookmaker fixtures permanently to disk.`,
        ingestedCount: incomingFixtures.length,
        totalCount: validatedFixtures.length,
        fixtures: validatedFixtures,
        auditReport,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ingestion failed';
      return res.status(500).json({ status: 'error', message: msg });
    }
  };

  app.post('/api/fixtures/ingest-slate', requireAdmin, handleIngestSlate);
  app.post('/api/fixtures/ingest-hollywoodbets', requireAdmin, handleIngestSlate);

  // 3. POST /api/fixtures/purge: Resets and wipes all stored fixtures and memory caches to a clean state
  app.post('/api/fixtures/purge', requireAdmin, (_req, res) => {
    try {
      writeDiskManifest([]);
      fixturesCache = {
        fixtures: [],
        syncedAt: new Date().toISOString(),
        provider: 'Purged Clean Slate',
        auditReport: {
          timestamp: new Date().toISOString(),
          totalFixturesAudited: 0,
          fullyAuthenticCount: 0,
          autoRepairedCount: 0,
          anomalousCount: 0,
          overallAuthenticityScore: 0,
          standingsCrossReferencedCount: 0,
          monotonicityPassRate: 0,
          metricsSanityPassRate: 0,
          leaguesAudited: [],
          repairedAnomaliesLog: [],
        },
      };

      return res.json({
        status: 'success',
        message: 'All stored fixtures and memory caches have been purged to a clean state.',
        count: 0,
        fixtures: [],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to purge fixtures';
      return res.status(500).json({ status: 'error', message: msg });
    }
  });

  // 4. POST /api/fixtures/delete: Deletes a specific match by ID from disk and active state
  app.post('/api/fixtures/delete', requireAdmin, (req, res) => {
    try {
      const { matchId } = req.body || {};
      if (!matchId || typeof matchId !== 'string') {
        return res.status(400).json({ status: 'error', message: 'matchId is required' });
      }

      const current = readDiskManifest();
      const updated = current.filter((f: any) => f && f.id !== matchId);

      const { fixtures: validated, auditReport } = verifyAndSanitizeFixtures(updated);
      writeDiskManifest(validated);

      if (fixturesCache) {
        fixturesCache.fixtures = validated;
        fixturesCache.auditReport = auditReport;
        fixturesCache.syncedAt = new Date().toISOString();
      }

      return res.json({
        status: 'success',
        message: `Match ${matchId} deleted successfully.`,
        deletedId: matchId,
        remainingCount: validated.length,
        fixtures: validated,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete fixture';
      return res.status(500).json({ status: 'error', message: msg });
    }
  });

  // Force Deep Standings Recalibration Endpoint
  app.post('/api/fixtures/recalibrate', requireAdmin, async (_req, res) => {
    try {
      standingsMemoryCache.clear();
      const liveData = await getLiveScoreboardFixtures(true);
      return res.json({
        status: 'recalibrated',
        count: liveData.fixtures.length,
        syncedAt: liveData.syncedAt,
        auditReport: liveData.auditReport,
        fixtures: liveData.fixtures,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Deep recalibration failed';
      return res.status(500).json({ status: 'error', message: msg });
    }
  });

  // Server-side AI Self-Learning Synthesis endpoint
  app.post('/api/ai/tactical-learning', requireAdmin, async (req, res) => {
    try {
      const { accuracyPct, brierLoss, totalEpochs, weights, recentEvaluations } = req.body || {};

      const ai = getGeminiClient();

      if (!ai) {
        return res.status(503).json({
          status: 'unavailable',
          message: 'AI tactical synthesis is not configured on the server.',
        });
      }

      const prompt = `You are an elite sports quantitative analyst and machine learning tactical engineer.
Analyze the following football prediction model training telemetry:
- Current Accuracy: ${accuracyPct}%
- Brier Loss Score: ${brierLoss} (lower is better, 0.0 to 1.0)
- Epochs Completed: ${totalEpochs}
- Current Calibrated Weights: ${JSON.stringify(weights || {})}
- Sample Recent Match Evaluations: ${JSON.stringify((recentEvaluations || []).slice(0, 6))}

Provide a concise, highly analytical tactical synthesis formatted strictly in JSON with the following structure:
{
  "summary": "1-2 sentences on the model's convergence, predictive calibration, and notable tactical biases.",
  "recommendations": ["3 concise bullet points with strategic recommendations for future weight tuning."],
  "ruleEfficiency": [
    { "rule": "Rule 1: Motivation Stakes", "impact": "description of impact", "status": "recalibrating" },
    { "rule": "Rule 3: Home Dominance", "impact": "description of impact", "status": "recalibrating" },
    { "rule": "Rule 5: Possession & Shots", "impact": "description of impact", "status": "recalibrating" },
    { "rule": "Rule 6: Midweek Fatigue", "impact": "description of impact", "status": "recalibrating" },
    { "rule": "Rule 7: Volatility Cap", "impact": "description of impact", "status": "recalibrating" },
    { "rule": "Rule 8: Favourite Floor", "impact": "description of impact", "status": "recalibrating" }
  ]
}`;

      // Multi-model resilience: try fastest flash models, retrying on 503 high-demand spikes
      const candidateModels = ['gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
      let parsed: any = null;
      let lastSynthesisErr: unknown = null;

      for (const modelName of candidateModels) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                responseMimeType: 'application/json',
              },
            });
            const responseText = response.text?.trim() || '{}';
            parsed = JSON.parse(responseText);
            break;
          } catch (err: unknown) {
            lastSynthesisErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('503') || msg.includes('high demand') || msg.includes('429') || msg.includes('UNAVAILABLE') || msg.includes('resource_exhausted') || msg.includes('quota') || msg.includes('rate-limit')) {
              await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
              continue;
            }
            break;
          }
        }
        if (parsed && parsed.summary) {
          break;
        }
      }

      if (parsed && parsed.summary) {
        return res.json({
          status: 'gemini_analyzed',
          synthesis: {
            summary: parsed.summary,
            recommendations: parsed.recommendations || ['Maintain balanced shot differential weights.'],
            ruleEfficiency: parsed.ruleEfficiency || [],
            timestamp: new Date().toISOString(),
          },
        });
      }

      return res.status(503).json({
        status: 'unavailable',
        message: 'Gemini synthesis did not return a valid result.',
        detail: lastSynthesisErr instanceof Error ? lastSynthesisErr.message : undefined,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown server error';
      console.warn('AI tactical learning unavailable:', errorMsg);
      return res.status(503).json({
        status: 'unavailable',
        message: 'AI tactical synthesis could not be completed.',
      });
    }
  });

  // In-memory sync state contains only measured coefficients received from the operator pipeline.
  // No pre-seeded sample sizes or learned coefficients are assumed.
  let superLearningSyncState = {
    sync_timestamp: '',
    model_engine: 'Chronological Team Intelligence Calibration',
    meta_improvement_notes: 'No synchronized learned team coefficients are available until derived from completed training-window results.',
    team_intelligence_matrices: {},
  };

  // Aggressive Super-Learning Protocol Sync - GET
  app.get('/api/ai/super-learning/sync', (_req, res) => {
    return res.json(superLearningSyncState);
  });

  // Aggressive Super-Learning Protocol Sync - POST
  app.post('/api/ai/super-learning/sync', requireAdmin, (req, res) => {
    try {
      const payload = req.body || {};
      if (payload && payload.team_intelligence_matrices) {
        superLearningSyncState = {
          sync_timestamp: new Date().toISOString(),
          model_engine: payload.model_engine || superLearningSyncState.model_engine,
          meta_improvement_notes: payload.meta_improvement_notes || superLearningSyncState.meta_improvement_notes,
          team_intelligence_matrices: {
            ...superLearningSyncState.team_intelligence_matrices,
            ...payload.team_intelligence_matrices,
          },
        };
      }
      return res.json({ status: 'ok', updated: superLearningSyncState });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sync update failed';
      return res.status(500).json({ status: 'error', message: msg });
    }
  });

  // ---------------------------------------------------------------------
  // API-Football automation: status, manual triggers, and settled results
  // ---------------------------------------------------------------------

  // Returns settled match results written by the automated settlement job.
  // The client merges this with the static seed dataset so "yesterday" and
  // the learning engine see real, growing data instead of a frozen snapshot.
  app.get('/api/results/settled', (_req, res) => {
    try {
      const entries = readResultsLog();
      return res.json({ status: 'success', count: entries.length, results: entries });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to read settled results';
      return res.status(500).json({ status: 'error', message: msg });
    }
  });

  // Visibility into whether the automated jobs are actually running and provider status
  // Public, read-only: honest accuracy on predictions frozen before kickoff.
  app.get('/api/predictions/track-record', (_req, res) => {
    try {
      const verification = verifyLog(PREDICTION_LOG_PATH);
      const { lines } = readLog(PREDICTION_LOG_PATH);
      const report = summarize(lines, PREDICTION_MIN_SAMPLE);
      return res.json({
        status: 'ok',
        logIntact: verification.ok,
        logProblem: verification.reason,
        headHash: verification.headHash,
        entries: verification.count,
        ...report,
      });
    } catch (err: unknown) {
      return res.status(500).json({ status: 'error', message: err instanceof Error ? err.message : 'Track record unavailable' });
    }
  });

  app.get('/api/admin/cron-status', (_req, res) => {
    try {
      return res.json({
        status: 'success',
        sportApiAiConfigured: sportApiAiConfigured(),
        theRundownConfigured: theRundownConfigured(),
        cron: readCronStatus(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to read cron status';
      return res.status(500).json({ status: 'error', message: msg });
    }
  });

  // Manual triggers, mainly for testing the pipeline without waiting for the schedule.
  app.post('/api/admin/run-ingest-now', requireAdmin, async (_req, res) => {
    const result = await runDailyIngestJob();
    return res.status(result.success ? 200 : 500).json({ status: result.success ? 'success' : 'error', ...result });
  });

  app.post('/api/admin/run-settlement-now', requireAdmin, async (_req, res) => {
    const result = await runSettlementJob();
    return res.status(result.success ? 200 : 500).json({ status: result.success ? 'success' : 'error', ...result });
  });

  // Manual upload endpoint for results — matches parsed results against the real
  // fixture manifest and appends them to data/results-log.json (the same store the
  // automated settlement job writes to), so manually-entered results actually feed
  // "yesterday's performance" and the learning engine, not a dead-end file.
  app.post('/api/admin/upload-results', requireAdmin, async (req, res) => {
    try {
      const { rawData } = req.body;
      if (!rawData || typeof rawData !== 'string') {
        return res.status(400).json({ error: 'Invalid result data' });
      }

      const rawResults = parseRawResults(rawData);
      const manifest = readRawDiskManifest();
      const existingLog = readResultsLog();
      const settledIds = new Set(existingLog.map((e) => e.id));
      const newEntries: SettledResultEntry[] = [];
      let unmatchedCount = 0;

      for (const r of rawResults) {
        if (!r.matchTitle || Number.isNaN(r.homeScore) || Number.isNaN(r.awayScore)) continue;
        const parts = r.matchTitle.split(/\s+vs\s+/i);
        if (parts.length !== 2) {
          unmatchedCount++;
          continue;
        }
        const [homeRaw, awayRaw] = parts;
        const homeKey = normalizeTeamName(homeRaw);
        const awayKey = normalizeTeamName(awayRaw);

        const matchedFixture = manifest.find((f: any) => {
          const fHome = normalizeTeamName(f.homeTeam?.name);
          const fAway = normalizeTeamName(f.awayTeam?.name);
          const fDate = (f.kickoffTime || '').slice(0, 10);
          return fHome === homeKey && fAway === awayKey && (!r.date || fDate === r.date);
        });

        if (!matchedFixture) {
          unmatchedCount++;
          continue;
        }
        if (settledIds.has(matchedFixture.id)) continue;

        const outcome: 'home' | 'draw' | 'away' =
          r.homeScore > r.awayScore ? 'home' : r.homeScore < r.awayScore ? 'away' : 'draw';

        newEntries.push({
          id: matchedFixture.id,
          fixture: matchedFixture,
          homeScore: r.homeScore,
          awayScore: r.awayScore,
          actualOutcome: outcome,
          date: r.date || (matchedFixture.kickoffTime || '').slice(0, 10),
          notes: 'Settled via manual result upload',
          settledAt: new Date().toISOString(),
        });
      }

      if (newEntries.length > 0) {
        writeResultsLog([...existingLog, ...newEntries]);
      }
      reconcilePredictionOutcomes();

      const message = unmatchedCount > 0
        ? `Settled ${newEntries.length} results. ${unmatchedCount} lines could not be matched to a known fixture (check team names/date match your uploaded slate exactly).`
        : `Settled ${newEntries.length} results.`;

      res.json({ success: true, count: newEntries.length, unmatchedCount, message });
    } catch (error) {
      console.error('Error uploading results:', error);
      res.status(500).json({ error: 'Failed to upload results' });
    }
  });

  // Upload fixture PDF — extracts text, then runs it through the same real
  // Hollywoodbets-format parser and manifest pipeline as the paste-text flow.
  app.post('/api/admin/upload-fixture-file', requireAdmin, upload.single('file'), async (req, res) => {
    const uploadedPath = req.file?.path;
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const text = await extractTextFromPDF(req.file.path);
      const incomingFixtures = parseHollywoodbetsRawText(text);

      if (incomingFixtures.length === 0) {
        return res.status(400).json({ error: 'No fixtures could be parsed from this PDF. Make sure it contains a Hollywoodbets-format fixture list.' });
      }

      const { validatedFixtures } = await ingestFixturesIntoManifest(incomingFixtures, true);
      res.json({ success: true, count: incomingFixtures.length, totalCount: validatedFixtures.length });
    } catch (error) {
      console.error('Error uploading fixture file:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to upload fixture file' });
    } finally {
      if (uploadedPath) {
        try { fs.unlinkSync(uploadedPath); } catch {}
      }
    }
  });

  // Fetch fixture from link — same real parser/pipeline. Note: this only works for
  // pages whose raw text already resembles a Hollywoodbets-style fixture list; it is
  // NOT a general-purpose scraper and won't reliably extract from arbitrary bookmaker
  // pages (most render odds via JavaScript, which a simple HTML fetch won't execute).
  app.post('/api/admin/fetch-fixture-link', requireAdmin, async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'No URL provided' });
      const text = await scrapeUrl(url);
      const incomingFixtures = parseHollywoodbetsRawText(text);

      if (incomingFixtures.length === 0) {
        return res.status(400).json({ error: 'No fixtures could be parsed from this page. This works best with a page whose raw HTML already contains Hollywoodbets-format text, not a JavaScript-rendered odds page.' });
      }

      const { validatedFixtures } = await ingestFixturesIntoManifest(incomingFixtures);
      res.json({ success: true, count: incomingFixtures.length, totalCount: validatedFixtures.length });
    } catch (error) {
      console.error('Error fetching fixture link:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch fixture link' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Soccer Prediction Server running on port ${PORT}`);

    if (sportApiAiConfigured()) {
      console.log('[startup] SportAPI.ai is configured as PRIMARY feed.');
    } else {
      console.log('[startup] SportAPI.ai is not configured (SPORTAPI_AI_KEY missing).');
    }

    if (theRundownConfigured()) {
      console.log('[startup] TheRundown.io is configured as SECONDARY odds/coverage feed.');
    } else {
      console.log('[startup] TheRundown.io is not configured (THERUNDOWN_KEY missing).');
    }
    console.log('[startup] Scheduling daily ingestion (05:00) and settlement (every 3h).');

    // Daily ingestion: pull the day's real fixtures at 05:00 server time.
    cron.schedule('0 5 * * *', () => {
      runDailyIngestJob().catch((e) => console.error('[cron:ingest] unhandled error', e));
    });

    // Settlement: check for finished matches every 3 hours around the clock,
    // since kickoff times and match lengths vary across leagues/timezones.
    cron.schedule('0 */3 * * *', () => {
      runSettlementJob().catch((e) => console.error('[cron:settlement] unhandled error', e));
    });

    // Freeze predictions for upcoming fixtures every 30 minutes (once per fixture, never updated).
    cron.schedule('*/30 * * * *', () => {
      try { runPredictionFreezeJob(); } catch (e) { console.error('[cron:prediction-log] unhandled error', e); }
    });

    // Run both once, shortly after boot, so the pipeline doesn't sit idle
    // until the next scheduled slot (e.g. after a redeploy).
    setTimeout(() => {
      runDailyIngestJob().catch((e) => console.error('[cron:ingest] startup run failed', e));
      runSettlementJob().catch((e) => console.error('[cron:settlement] startup run failed', e));
    }, 10_000);
    setTimeout(() => { try { runPredictionFreezeJob(); } catch (e) { console.error('[prediction-log] startup freeze failed', e); } }, 25_000);
  });
}

startServer();

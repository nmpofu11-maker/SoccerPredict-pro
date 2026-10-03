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

// Keep the persisted daily slate from serving schedule-only fixtures while the
// primary provider enrichment cache is still cold after startup/redeploy.
const PRIMARY_SLATE_REFRESH_TTL_MS = 5 * 60 * 1000;
let primarySlateRefreshAt = 0;
let primarySlateRefreshPromise: Promise<void> | null = null;

function hasVerifiedPredictionEvidence(fixture: any): boolean {
  return Boolean(
    fixture?.homeTeam?.formSource ||
    fixture?.awayTeam?.formSource ||
    fixture?.homeTeam?.standingsSource ||
    fixture?.awayTeam?.standingsSource ||
    fixture?.h2h?.source ||
    fixture?.homeTeam?.matchStatsSource ||
    fixture?.awayTeam?.matchStatsSource ||
    fixture?.homeTeam?.advancedStatsSource ||
    fixture?.awayTeam?.advancedStatsSource
  );
}

async function refreshPrimaryEvidenceForDailySlate(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - primarySlateRefreshAt < PRIMARY_SLATE_REFRESH_TTL_MS) return;
  if (primarySlateRefreshPromise) return primarySlateRefreshPromise;

  primarySlateRefreshPromise = (async () => {
    try {
      const current = readRawDiskManifest();
      if (!current.length) return;

      const upcoming = current.filter((fixture: any) => {
        const kickoff = Date.parse(String(fixture?.kickoffTime || ''));
        return Number.isFinite(kickoff) && kickoff >= now - 48 * 60 * 60 * 1000;
      });
      if (!upcoming.length) return;

      const evidenceCount = upcoming.filter(hasVerifiedPredictionEvidence).length;
      if (!force && evidenceCount >= Math.max(1, Math.ceil(upcoming.length * 0.35))) return;

      const requestedDates = Array.from(new Set(
        upcoming
          .map((fixture: any) => String(fixture.kickoffTime).slice(0, 10))
          .filter(Boolean)
      ));

      const providerResult = await enrichFixturesWithFootballApis(upcoming as any, requestedDates);
      let enriched = providerResult.fixtures as any[];

      // Football-Data.org remains a secondary fallback only.
      if (footballDataConfigured() && enriched.length > 0) {
        const fallback = await enrichFixturesWithFootballData(enriched);
        enriched = fallback.fixtures as any[];
      }

      if (enriched.length > 0) {
        const currentByKey = new Map<string, any>();
        for (const fixture of current) {
          const key = String(fixture?.homeTeam?.name || '').toLowerCase() + '|' +
            String(fixture?.awayTeam?.name || '').toLowerCase() + '|' +
            String(fixture?.kickoffTime || '').slice(0, 10);
          currentByKey.set(key, fixture);
        }
        for (const fixture of enriched) {
          const key = String(fixture?.homeTeam?.name || '').toLowerCase() + '|' +
            String(fixture?.awayTeam?.name || '').toLowerCase() + '|' +
            String(fixture?.kickoffTime || '').slice(0, 10);
          currentByKey.set(key, fixture);
        }

        const { fixtures: validated, auditReport } = verifyAndSanitizeFixtures(Array.from(currentByKey.values()));
        writeDiskManifest(validated);
        fixturesCache = {
          fixtures: validated,
          syncedAt: new Date().toISOString(),
          provider: 'SportAPI.ai + Sportmonks primary evidence (Football-Data fallback)',
          auditReport,
        };
      }
    } catch (err) {
      console.warn('[daily-slate] primary evidence refresh failed safely:', err instanceof Error ? err.message : String(err));
    } finally {
      primarySlateRefreshAt = Date.now();
      primarySlateRefreshPromise = null;
    }
  })();

  return primarySlateRefreshPromise;
}

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
                  ...(homeRank ? { standingsSource: 'ESPN' } : {}),
                  form: homeFormParsed,
                  ...(homeFormParsed.length > 0 ? { formSource: 'ESPN' } : {}),
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
                  ...(awayRank ? { standingsSource: 'ESPN' } : {}),
                  form: awayFormParsed,
                  ...(awayFormParsed.length > 0 ? { formSource: 'ESPN' } : {}),
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

    const { fixtures: predictionFixtures } = verifyAndSanitizeFixtures(readRawDiskManifest());
    for (const f of predictionFixtures) {
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

interface IngestProviderDiagnostics {
  configured: boolean;
  requestedDates: string[];
  requestCount: number;
  successfulRequests: number;
  failedRequests: number;
  httpErrors: string[];
  rawRecords: number;
  mappedRecords: number;
  rejectedRecords: number;
  mappingRejectReasons: Record<string, number>;
  notes: string[];
}

interface IngestDiagnostics {
  startedAt: string;
  completedAt?: string;
  timezone: string;
  requestedDates: string[];
  sportApiAi: IngestProviderDiagnostics;
  theRundown: IngestProviderDiagnostics;
  pitchApi: IngestProviderDiagnostics;
  sportDb: IngestProviderDiagnostics;
  apiFootball: IngestProviderDiagnostics;
  sportmonks: IngestProviderDiagnostics;
  manifestBefore: number;
  manifestAfter: number;
  added: number;
  sourceUsed: 'SPORTAPI_AI' | 'THERUNDOWN' | 'PITCHAPI' | 'SPORTDB' | 'API_FOOTBALL' | 'SPORTMONKS' | null;
}

interface CronStatus {
  ingest: {
    lastRunAt: string | null;
    lastSuccess: boolean | null;
    lastMessage: string;
    fixturesIngested: number;
    sourceUsed?: 'SPORTAPI_AI' | 'THERUNDOWN' | 'PITCHAPI' | 'SPORTDB' | 'API_FOOTBALL' | 'SPORTMONKS' | null;
    diagnostics?: IngestDiagnostics;
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
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Format with explicit timezone (e.g., 2026-10-01T18:00:00Z or +02:00)
  const normalizedWithT = trimmed.replace(' ', 'T');
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(normalizedWithT)) {
    const parsed = new Date(normalizedWithT);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }

  // Format like '2026-10-01 18:00:00' or '2026-10-01T18:00:00' (SportAPI.ai supplies UTC without timezone suffix)
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const isoUtc = `${normalizedWithT.length === 16 ? normalizedWithT + ':00' : normalizedWithT}Z`;
    const parsed = new Date(isoUtc);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }

  // Reject calendar dates without a time component; midnight is not a real kickoff.
  if (!/[T ]\d{2}:\d{2}/.test(trimmed)) return null;
  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function normalizeTeamName(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Build an internal fixture record from a SportAPI.ai fixture. */
function mapSportApiAiToInternalFixture(f: any, providerDate?: string): any {
  const homeName = f.home_team?.name || f.homeTeam?.name || (typeof f.home_team === 'string' ? f.home_team : '');
  const awayName = f.away_team?.name || f.awayTeam?.name || (typeof f.away_team === 'string' ? f.away_team : '');
  if (!homeName || !awayName) return null;
  const idStr = String(f.id || `${homeName}_${awayName}`);

  // Date-only provider records do not contain a real kickoff time; reject them.
  const kickoffTime =
    parseProviderKickoff(f.datetime) ||
    parseProviderKickoff(f.kickoff_time) ||
    parseProviderKickoff(f.utc_date) ||
    parseProviderKickoff(f.start_time) ||
    (typeof f.date === 'string' && /[T ]\d{2}:\d{2}/.test(f.date) ? parseProviderKickoff(f.date) : null);
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
    sportApiAiLeagueId: Number(f.league_id || f.league?.id) || undefined,
    sportApiAiHomeTeamId: Number(f.home_id || f.home_team?.id || f.homeTeam?.id) || undefined,
    sportApiAiAwayTeamId: Number(f.away_id || f.away_team?.id || f.awayTeam?.id) || undefined,
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
    h2h: null,

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
    h2h: null,

  };
}

/** Build an internal fixture record from a PitchAPI match. */
function mapPitchApiToInternalFixture(match: any): any {
  const homeName = match?.home_team?.name || '';
  const awayName = match?.away_team?.name || '';
  if (!homeName || !awayName) return null;
  const kickoffTime = parseProviderKickoff(match?.time_utc);
  if (!kickoffTime) return null;
  const homeScore = Number(match?.score_home);
  const awayScore = Number(match?.score_away);
  const hasFinishedScore = Number.isFinite(homeScore) && Number.isFinite(awayScore);
  const leagueName = match?.league?.name || 'PitchAPI Football';
  const id = String(match.id || (homeName + '_' + awayName));
  return {
    id: 'pitchapi_' + id,
    pitchApiMatchId: id,
    automationSource: 'PITCHAPI',
    kickoffTime,
    league: leagueName,
    competition: leagueName,
    venue: match?.stadium?.name || match?.venue?.name || 'Unknown Venue',
    round: match?.round || 'Unknown Round',
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: { id: 'pitchapi_team_' + (match?.home_team?.id || normalizeTeamName(homeName)), name: homeName, shortName: homeName.slice(0,3).toUpperCase(), leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null },
    awayTeam: { id: 'pitchapi_team_' + (match?.away_team?.id || normalizeTeamName(awayName)), name: awayName, shortName: awayName.slice(0,3).toUpperCase(), leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null },
    h2h: null,
    ...(hasFinishedScore ? { pitchApiScore: { home: homeScore, away: awayScore } } : {}),
  };
}

/** Build an internal fixture record from a SportDB match (dashboard.sportdb.dev). */
function mapSportDbToInternalFixture(match: any, fallbackDateStr: string): any {
  const homeName = typeof match?.home_team === 'string' ? match.home_team : (match?.home_team?.name || '');
  const awayName = typeof match?.away_team === 'string' ? match.away_team : (match?.away_team?.name || '');
  if (!homeName || !awayName) return null;

  const rawKickoff = match?.utc_date || match?.kickoff_time || match?.date;
  const kickoffTime = typeof rawKickoff === 'string' && /[T ]\d{2}:\d{2}/.test(rawKickoff)
    ? parseProviderKickoff(rawKickoff)
    : null;
  if (!kickoffTime) return null;

  const homeScore = Number(match?.score?.home ?? match?.score?.fulltime?.home ?? match?.score_home);
  const awayScore = Number(match?.score?.away ?? match?.score?.fulltime?.away ?? match?.score_away);
  const hasFinishedScore = Number.isFinite(homeScore) && Number.isFinite(awayScore);

  const leagueName = typeof match?.league === 'string' ? match.league : (match?.league?.name || 'SportDB Football');
  const id = String(match.id || match.match_id || `${homeName}_${awayName}`);

  return {
    id: 'sportdb_' + id,
    sportDbMatchId: id,
    automationSource: 'SPORTDB',
    kickoffTime,
    league: leagueName,
    competition: leagueName,
    venue: typeof match?.venue === 'string' ? match.venue : (match?.venue?.name || 'Unknown Venue'),
    round: match?.round || 'Regular Season',
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: { id: 'sportdb_team_' + normalizeTeamName(homeName), name: homeName, shortName: homeName.slice(0, 3).toUpperCase(), leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null },
    awayTeam: { id: 'sportdb_team_' + normalizeTeamName(awayName), name: awayName, shortName: awayName.slice(0, 3).toUpperCase(), leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null },
    h2h: null,
    ...(hasFinishedScore ? { sportDbScore: { home: homeScore, away: awayScore } } : {}),
  };
}

/**
 * Daily ingestion job: pulls today's real fixtures from SportAPI.ai (primary)
 * or TheRundown (secondary) and merges them into the disk manifest, without
 * overwriting any existing Hollywoodbets slate entries.
 */
async function runDailyIngestJob(): Promise<{ success: boolean; message: string; count: number; diagnostics: IngestDiagnostics }> {
  const status = readCronStatus();
  const startedAt = new Date().toISOString();
  const baseDate = new Date();
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateStr = dateFormatter.format(baseDate);
  const nextDate = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
  const nextDateStr = dateFormatter.format(nextDate);
  const ingestDates = [dateStr, nextDateStr];
  const makeProviderDiagnostics = (configured: boolean): IngestProviderDiagnostics => ({
    configured,
    requestedDates: [...ingestDates],
    requestCount: 0,
    successfulRequests: 0,
    failedRequests: 0,
    httpErrors: [],
    rawRecords: 0,
    mappedRecords: 0,
    rejectedRecords: 0,
    mappingRejectReasons: {},
    notes: [],
  });

  const diagnostics: IngestDiagnostics = {
    startedAt,
    timezone: 'Africa/Johannesburg',
    requestedDates: ingestDates,
    sportApiAi: makeProviderDiagnostics(sportApiAiConfigured()),
    theRundown: makeProviderDiagnostics(theRundownConfigured()),
    pitchApi: makeProviderDiagnostics(pitchApiConfigured()),
    sportDb: makeProviderDiagnostics(sportDbConfigured()),
    apiFootball: makeProviderDiagnostics(apiFootballConfigured()),
    sportmonks: makeProviderDiagnostics(sportmonksConfigured()),
    manifestBefore: readRawDiskManifest().length,
    manifestAfter: readRawDiskManifest().length,
    added: 0,
    sourceUsed: null,
  };

  const noteReject = (provider: IngestProviderDiagnostics, reason: string) => {
    provider.rejectedRecords++;
    provider.mappingRejectReasons[reason] = (provider.mappingRejectReasons[reason] || 0) + 1;
  };

  let mapped: any[] = [];
  let sourceUsed: 'SPORTAPI_AI' | 'THERUNDOWN' | 'PITCHAPI' | 'SPORTDB' | 'API_FOOTBALL' | 'SPORTMONKS' | null = null;

  if (diagnostics.sportApiAi.configured) {
    for (const candidateDate of ingestDates) {
      diagnostics.sportApiAi.requestCount++;
      try {
        const rawFixtures = await fetchSportApiAiFixturesByDate(candidateDate);
        diagnostics.sportApiAi.successfulRequests++;
        diagnostics.sportApiAi.rawRecords += rawFixtures.length;

        const mappedForDate: any[] = [];
        for (const fixture of rawFixtures) {
          const mappedFixture = mapSportApiAiToInternalFixture(fixture, candidateDate);
          if (mappedFixture) mappedForDate.push(mappedFixture);
          else noteReject(diagnostics.sportApiAi, 'unsupported_or_missing_team_or_kickoff');
        }
        diagnostics.sportApiAi.mappedRecords += mappedForDate.length;

        if (mappedForDate.length > 0) {
          mapped.push(...mappedForDate);
          sourceUsed = 'SPORTAPI_AI';
        } else if (rawFixtures.length > 0) {
          diagnostics.sportApiAi.notes.push(
            `Returned ${rawFixtures.length} record(s) for ${candidateDate}, but none mapped to the internal fixture schema.`
          );
        } else {
          diagnostics.sportApiAi.notes.push(`HTTP request succeeded for ${candidateDate}, but provider returned 0 fixture records.`);
        }
      } catch (err: unknown) {
        diagnostics.sportApiAi.failedRequests++;
        const message = err instanceof Error ? err.message : 'Unknown SportAPI.ai error';
        diagnostics.sportApiAi.httpErrors.push(message);
        console.warn(`[cron:ingest] SportAPI.ai failed for ${candidateDate}: ${message}`);
      }
    }
  } else {
    diagnostics.sportApiAi.notes.push('SPORTAPI_AI_KEY not configured.');
  }

  // TheRundown is used when SportAPI.ai produced no usable records.
  if (mapped.length === 0 && diagnostics.theRundown.configured) {
    for (const candidateDate of ingestDates) {
      diagnostics.theRundown.requestCount++;
      try {
        const rundownEvents = await fetchAllTheRundownSoccerEvents(candidateDate);
        diagnostics.theRundown.successfulRequests++;
        diagnostics.theRundown.rawRecords += rundownEvents.length;

        const mappedForDate: any[] = [];
        for (const event of rundownEvents) {
          const mappedFixture = mapTheRundownToInternalFixture(event);
          if (mappedFixture) mappedForDate.push(mappedFixture);
          else noteReject(diagnostics.theRundown, 'unsupported_or_missing_team_or_kickoff');
        }
        diagnostics.theRundown.mappedRecords += mappedForDate.length;

        if (mappedForDate.length > 0) {
          mapped.push(...mappedForDate);
          sourceUsed = 'THERUNDOWN';
        } else {
          diagnostics.theRundown.notes.push(
            `Request succeeded for ${candidateDate}, but ${rundownEvents.length} event(s) were returned by the provider client and none mapped.`
          );
        }
      } catch (err: unknown) {
        diagnostics.theRundown.failedRequests++;
        const message = err instanceof Error ? err.message : 'Unknown TheRundown error';
        diagnostics.theRundown.httpErrors.push(message);
        console.warn(`[cron:ingest] TheRundown failed for ${candidateDate}: ${message}`);
      }
    }
  } else if (mapped.length === 0) {
    diagnostics.theRundown.notes.push(
      diagnostics.theRundown.configured
        ? 'Not queried because SportAPI.ai produced usable fixtures.'
        : 'THERUNDOWN_API_KEY not configured.'
    );
  }

  // PitchAPI is the third fixture source and is queried only when the first two
  // providers produced no usable fixtures.
  if (mapped.length === 0 && diagnostics.pitchApi.configured) {
    for (const candidateDate of ingestDates) {
      diagnostics.pitchApi.requestCount++;
      try {
        const pitchMatches = await fetchPitchApiFixturesByDate(candidateDate);
        diagnostics.pitchApi.successfulRequests++;
        diagnostics.pitchApi.rawRecords += pitchMatches.length;
        const mappedForDate: any[] = [];
        for (const match of pitchMatches) {
          const mappedFixture = mapPitchApiToInternalFixture(match);
          if (mappedFixture) mappedForDate.push(mappedFixture);
          else noteReject(diagnostics.pitchApi, 'unsupported_or_missing_team_or_kickoff');
        }
        diagnostics.pitchApi.mappedRecords += mappedForDate.length;
        if (mappedForDate.length > 0) {
          mapped.push(...mappedForDate);
          sourceUsed = 'PITCHAPI';
        } else {
          diagnostics.pitchApi.notes.push('Request succeeded for ' + candidateDate + ', but ' + pitchMatches.length + ' match(es) returned and none mapped.');
        }
      } catch (err: unknown) {
        diagnostics.pitchApi.failedRequests++;
        const message = err instanceof Error ? err.message : 'Unknown PitchAPI error';
        diagnostics.pitchApi.httpErrors.push(message);
        console.warn('[cron:ingest] PitchAPI failed for ' + candidateDate + ': ' + message);
      }
    }
  } else if (mapped.length === 0) {
    diagnostics.pitchApi.notes.push(diagnostics.pitchApi.configured ? 'Not queried because another provider produced usable fixtures.' : 'PITCHAPI_API_KEY not configured.');
  }

  // SportDB (https://dashboard.sportdb.dev) is the fourth fixture source, queried
  // if previous providers yielded no fixtures.
  if (mapped.length === 0 && diagnostics.sportDb.configured) {
    for (const candidateDate of ingestDates) {
      diagnostics.sportDb.requestCount++;
      try {
        const sportDbMatches = await fetchSportDbFixturesByDate(candidateDate);
        diagnostics.sportDb.successfulRequests++;
        diagnostics.sportDb.rawRecords += sportDbMatches.length;
        const mappedForDate: any[] = [];
        for (const match of sportDbMatches) {
          const mappedFixture = mapSportDbToInternalFixture(match, candidateDate);
          if (mappedFixture) mappedForDate.push(mappedFixture);
          else noteReject(diagnostics.sportDb, 'unsupported_or_missing_team_or_kickoff');
        }
        diagnostics.sportDb.mappedRecords += mappedForDate.length;
        if (mappedForDate.length > 0) {
          mapped.push(...mappedForDate);
          sourceUsed = 'SPORTDB';
        } else {
          diagnostics.sportDb.notes.push('Request succeeded for ' + candidateDate + ', but ' + sportDbMatches.length + ' match(es) returned and none mapped.');
        }
      } catch (err: unknown) {
        diagnostics.sportDb.failedRequests++;
        const message = err instanceof Error ? err.message : 'Unknown SportDB error';
        diagnostics.sportDb.httpErrors.push(message);
        console.warn('[cron:ingest] SportDB failed for ' + candidateDate + ': ' + message);
      }
    }
  } else if (mapped.length === 0) {
    diagnostics.sportDb.notes.push(diagnostics.sportDb.configured ? 'Not queried because another provider produced usable fixtures.' : 'SPORTDB_API_KEY not configured.');
  }

  // Primary provider enrichment runs first; secondary providers only fill verified gaps.
  // API-Football and Sportmonks are queried as independent schedule sources,
  // even when another provider already supplied fixtures. Exact team/date matches
  // enrich existing records; unmatched real fixtures expand competition coverage.
  diagnostics.apiFootball.requestCount = diagnostics.apiFootball.configured ? ingestDates.length : 0;
  diagnostics.sportmonks.requestCount = diagnostics.sportmonks.configured ? ingestDates.length : 0;
  try {
    const beforeProviderEnrichment = mapped.length;
    const providerResult = await enrichFixturesWithFootballApis(mapped as any, ingestDates);
    mapped = providerResult.fixtures as any[];
    if (diagnostics.apiFootball.configured) {
      diagnostics.apiFootball.rawRecords = providerResult.apiFootballFixtures;
      diagnostics.apiFootball.mappedRecords = providerResult.apiFootballMappedFixtures;
      diagnostics.apiFootball.successfulRequests = providerResult.apiFootballSuccessfulRequests;
      diagnostics.apiFootball.failedRequests = providerResult.apiFootballFailedRequests;
      if (providerResult.apiFootballFixtures === 0) diagnostics.apiFootball.notes.push('No API-Football fixtures returned for requested dates.');
    }
    if (diagnostics.sportmonks.configured) {
      diagnostics.sportmonks.rawRecords = providerResult.sportmonksFixtures;
      diagnostics.sportmonks.mappedRecords = providerResult.sportmonksMappedFixtures;
      diagnostics.sportmonks.successfulRequests = providerResult.sportmonksSuccessfulRequests;
      diagnostics.sportmonks.failedRequests = providerResult.sportmonksFailedRequests;
      if (providerResult.sportmonksFixtures === 0) diagnostics.sportmonks.notes.push('No Sportmonks fixtures returned for requested dates.');
    }
    if (diagnostics.apiFootball.configured) diagnostics.apiFootball.notes.push(`Team-form/standings enrichment updated ${providerResult.enrichedTeams} fixture(s).`);
    diagnostics.apiFootball.notes.push(...providerResult.errors.filter((e) => e.startsWith('API-Football')));
    diagnostics.sportmonks.notes.push(...providerResult.errors.filter((e) => e.startsWith('Sportmonks')));
    if (beforeProviderEnrichment === 0 && providerResult.apiFootballFixtures > 0) sourceUsed = 'API_FOOTBALL';
    if (beforeProviderEnrichment === 0 && providerResult.apiFootballFixtures === 0 && providerResult.sportmonksFixtures > 0) sourceUsed = 'SPORTMONKS';
  } catch (err) {
    diagnostics.apiFootball.failedRequests++;
    diagnostics.sportmonks.failedRequests++;
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.apiFootball.httpErrors.push(message);
    diagnostics.sportmonks.httpErrors.push(message);
  }

  // Secondary Football-Data.org fallback: fill only fields still missing after
  // SportAPI.ai + Sportmonks enrichment. It must never overwrite primary evidence.
  if (footballDataConfigured() && mapped.length > 0) {
    try {
      const enrichment = await enrichFixturesWithFootballData(mapped);
      mapped = enrichment.fixtures;
      diagnostics.sportApiAi.notes.push(
        'Football-Data fallback enrichment: ' + enrichment.enrichedCount + ' fixture(s) updated; ' + enrichment.errors.length + ' competition error(s).'
      );
      if (enrichment.errors.length > 0) diagnostics.sportApiAi.notes.push(...enrichment.errors);
    } catch (err) {
      diagnostics.sportApiAi.notes.push(
        'Football-Data fallback enrichment failed safely: ' + (err instanceof Error ? err.message : 'unknown error')
      );
    }
  } else if (!footballDataConfigured()) {
    diagnostics.sportApiAi.notes.push('Football-Data fallback unavailable: FOOTBALL_DATA_KEY is not configured.');
  }

  diagnostics.sourceUsed = sourceUsed;
  diagnostics.completedAt = new Date().toISOString();

  if (mapped.length === 0) {
    const sportSummary = diagnostics.sportApiAi.configured
      ? `requests ${diagnostics.sportApiAi.successfulRequests}/${diagnostics.sportApiAi.requestCount}, raw ${diagnostics.sportApiAi.rawRecords}, mapped ${diagnostics.sportApiAi.mappedRecords}`
      : 'not configured';
    const rundownSummary = diagnostics.theRundown.configured ? `requests ${diagnostics.theRundown.successfulRequests}/${diagnostics.theRundown.requestCount}, raw ${diagnostics.theRundown.rawRecords}, mapped ${diagnostics.theRundown.mappedRecords}` : 'not configured';
    const pitchSummary = diagnostics.pitchApi.configured ? `requests ${diagnostics.pitchApi.successfulRequests}/${diagnostics.pitchApi.requestCount}, raw ${diagnostics.pitchApi.rawRecords}, mapped ${diagnostics.pitchApi.mappedRecords}` : 'not configured';
    const sportDbSummary = diagnostics.sportDb.configured ? `requests ${diagnostics.sportDb.successfulRequests}/${diagnostics.sportDb.requestCount}, raw ${diagnostics.sportDb.rawRecords}, mapped ${diagnostics.sportDb.mappedRecords}` : 'not configured';
    const apiFootballSummary = diagnostics.apiFootball.configured ? `raw ${diagnostics.apiFootball.rawRecords}` : 'not configured';
    const sportmonksSummary = diagnostics.sportmonks.configured ? `raw ${diagnostics.sportmonks.rawRecords}` : 'not configured';
    const msg = `No automated fixtures ingested for ${ingestDates.join(' or ')}. SportAPI.ai: ${sportSummary}. TheRundown: ${rundownSummary}. PitchAPI: ${pitchSummary}. SportDB: ${sportDbSummary}. API-Football: ${apiFootballSummary}. Sportmonks: ${sportmonksSummary}.`;
    status.ingest = {
      lastRunAt: new Date().toISOString(),
      lastSuccess: false,
      lastMessage: msg,
      fixturesIngested: 0,
      sourceUsed: null,
      diagnostics,
    };
    writeCronStatus(status);
    console.warn(`[cron:ingest] ${msg}`, JSON.stringify(diagnostics));
    return { success: false, message: msg, count: 0, diagnostics };
  }

  try {
    const diskFixtures = readDiskManifest();
    diagnostics.manifestBefore = diskFixtures.length;
    const normalizeKey = (f: any) => {
      const home = normalizeTeamName(f.homeTeam?.name);
      const away = normalizeTeamName(f.awayTeam?.name);
      const date = (f.kickoffTime || '').slice(0, 10);
      return `${home}_vs_${away}_${date}`;
    };

    const mergedMap = new Map<string, any>();
    for (const df of diskFixtures) mergedMap.set(normalizeKey(df), df);

    let newCount = 0;
    for (const mf of mapped) {
      const key = normalizeKey(mf);
      const existing = mergedMap.get(key);
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
    fixturesCache = null;

    diagnostics.added = newCount;
    diagnostics.manifestAfter = combined.length;
    diagnostics.completedAt = new Date().toISOString();

    const sourceLabel = sourceUsed === 'SPORTAPI_AI' ? 'SportAPI.ai' : sourceUsed === 'THERUNDOWN' ? 'TheRundown.io' : sourceUsed === 'PITCHAPI' ? 'PitchAPI' : sourceUsed === 'SPORTDB' ? 'SportDB' : sourceUsed === 'API_FOOTBALL' ? 'API-Football' : 'Sportmonks';
    const msg = `Ingested ${mapped.length} fixtures from ${sourceLabel} for ${dateStr} (${newCount} new). Raw records: SportAPI.ai ${diagnostics.sportApiAi.rawRecords}; TheRundown ${diagnostics.theRundown.rawRecords}; PitchAPI ${diagnostics.pitchApi.rawRecords}; SportDB ${diagnostics.sportDb.rawRecords}; API-Football ${diagnostics.apiFootball.rawRecords}; Sportmonks ${diagnostics.sportmonks.rawRecords}. Mapped: SportAPI.ai ${diagnostics.sportApiAi.mappedRecords}; TheRundown ${diagnostics.theRundown.mappedRecords}; PitchAPI ${diagnostics.pitchApi.mappedRecords}; SportDB ${diagnostics.sportDb.mappedRecords}; API-Football ${diagnostics.apiFootball.mappedRecords}; Sportmonks ${diagnostics.sportmonks.mappedRecords}.`;
    status.ingest = {
      lastRunAt: new Date().toISOString(),
      lastSuccess: true,
      lastMessage: msg,
      fixturesIngested: mapped.length,
      sourceUsed,
      diagnostics,
    };
    writeCronStatus(status);
    console.log(`[cron:ingest] ${msg}`, JSON.stringify(diagnostics));
    return { success: true, message: msg, count: mapped.length, diagnostics };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown ingestion error';
    diagnostics.completedAt = new Date().toISOString();
    status.ingest = {
      lastRunAt: new Date().toISOString(),
      lastSuccess: false,
      lastMessage: msg,
      fixturesIngested: 0,
      sourceUsed,
      diagnostics,
    };
    writeCronStatus(status);
    console.error(`[cron:ingest] FAILED: ${msg}`, JSON.stringify(diagnostics));
    return { success: false, message: msg, count: 0, diagnostics };
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

  // Idempotent migration: sanitize existing runtime fixtures-manifest.json
  try {
    const rawFixtures = readRawDiskManifest();
    if (rawFixtures.length > 0) {
      const { fixtures: sanitized, changedCount } = sanitizeRuntimeManifest(rawFixtures);
      if (changedCount > 0) {
        writeDiskManifest(sanitized);
        console.log(`[migration] Sanitized ${changedCount} fixtures with unverified/placeholder stats in runtime manifest.`);
      }
    }
  } catch (err) {
    console.error('[migration] Error running startup manifest sanitization migration:', err);
  }

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
  app.get('/api/fixtures/daily-slate', async (_req, res) => {
    try {
      await refreshPrimaryEvidenceForDailySlate();
      const diskData = readDiskManifest();
      const { fixtures: validated } = verifyAndSanitizeFixtures(diskData);
      return res.json({
        status: 'success',
        count: validated.length,
        syncedAt: new Date().toISOString(),
        provider: 'SportAPI.ai + Sportmonks primary evidence (Football-Data fallback when needed)',
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
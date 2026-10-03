import type { MatchFixture, H2HRecord, MatchAuthenticityStamp } from '../types/soccer';

const BASE_URL = 'https://api.football-data.org/v4';

function getApiKey(): string {
  return (process.env.FOOTBALL_DATA_KEY || process.env.FOOTBALL_DATA_API_KEY)?.trim() || '';
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache for live matches & standings

export class FootballDataRateLimitError extends Error {
  constructor(detail: string) {
    super(`Football-Data.org rate limited (HTTP 429): ${detail}`);
    this.name = 'FootballDataRateLimitError';
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function requestSpacingMs(): number {
  const raw = Number(process.env.FOOTBALL_DATA_REQUEST_SPACING_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 1100;
}

let footballDataRateLimitedUntil = 0;

export function isFootballDataRateLimited(): boolean {
  return Date.now() < footballDataRateLimitedUntil;
}

export function setFootballDataRateLimitCooldown(ms: number): void {
  footballDataRateLimitedUntil = Math.max(footballDataRateLimitedUntil, Date.now() + ms);
}

export interface RawFinishedMatch {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: { id: number; name: string; shortName?: string };
  awayTeam: { id: number; name: string; shortName?: string };
  score: {
    winner?: string;
    fullTime: { home: number | null; away: number | null };
  };
}

export interface StandingsEntry {
  rank: number;
  points: number | null;
  name: string;
  teamId?: number;
}

const standingsCache = new Map<string, { expiresAt: number; teams: Map<string, StandingsEntry> }>();
const matchesCache = new Map<string, { expiresAt: number; matches: RawFinishedMatch[] }>();

export const FOOTBALL_DATA_COMPETITION_CODES: Record<string, string> = {
  'brasileirao': 'BSA',
  'brazilian serie a': 'BSA',
  'brazil serie a': 'BSA',
  'serie a brazil': 'BSA',
  'premier league': 'PL',
  'england premier league': 'PL',
  'english premier league': 'PL',
  'english premier': 'PL',
  'epl': 'PL',
  'barclays premier league': 'PL',
  'la liga': 'PD',
  'primera division': 'PD',
  'spanish la liga': 'PD',
  'la liga santander': 'PD',
  'la liga ea sports': 'PD',
  'spanish primera division': 'PD',
  'serie a': 'SA',
  'italian serie a': 'SA',
  'italy serie a': 'SA',
  'serie a enilive': 'SA',
  'bundesliga': 'BL1',
  '1. bundesliga': 'BL1',
  'german bundesliga': 'BL1',
  'germany bundesliga': 'BL1',
  'ligue 1': 'FL1',
  'french ligue 1': 'FL1',
  'france ligue 1': 'FL1',
  'championship': 'ELC',
  'english championship': 'ELC',
  'eredivisie': 'DED',
  'dutch eredivisie': 'DED',
  'primeira liga': 'PPL',
  'portuguese primeira liga': 'PPL',
  'liga portugal': 'PPL',
  'portuguese liga': 'PPL',
  'liga nos': 'PPL',
  'portugal primeira liga': 'PPL',
  'champions league': 'CL',
  'uefa champions league': 'CL',
  'european championship': 'EC',
  'world cup': 'WC',
  'fifa world cup': 'WC',
};

export function footballDataConfigured(): boolean {
  return getApiKey().length > 0;
}

export function normalize(value: string): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bfc\b|\bcf\b|\bsc\b|\bafc\b|\bclub\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export function teamNameMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  const normA = normalize(a);
  const normB = normalize(b);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.length >= 4 && normB.length >= 4) {
    if (normA.includes(normB) || normB.includes(normA)) return true;
  }
  const aliasA = normA.replace(/utd/g, 'united').replace(/ath/g, 'athletic').replace(/st\b/g, 'saint').replace(/inter/g, 'internazionale');
  const aliasB = normB.replace(/utd/g, 'united').replace(/ath/g, 'athletic').replace(/st\b/g, 'saint').replace(/inter/g, 'internazionale');
  if (aliasA === aliasB) return true;
  if (aliasA.length >= 4 && aliasB.length >= 4) {
    if (aliasA.includes(aliasB) || aliasB.includes(aliasA)) return true;
  }
  return false;
}

export function findStandingForTeam(
  teamName: string,
  shortName: string | undefined,
  standings: Map<string, StandingsEntry>
): StandingsEntry | undefined {
  const norm = normalize(teamName);
  if (standings.has(norm)) return standings.get(norm);
  if (shortName && standings.has(normalize(shortName))) return standings.get(normalize(shortName));

  for (const entry of standings.values()) {
    if (teamNameMatches(teamName, entry.name) || (shortName && teamNameMatches(shortName, entry.name))) {
      return entry;
    }
  }
  return undefined;
}

export function resolveCompetitionCode(league: string): string | null {
  const raw = league.toLowerCase();
  // The unqualified alias "Premier League" must never map South African fixtures to England's PL.
  if (/south africa|south african|\brsa\b/.test(raw)) return null;
  const clean = raw.replace(/^[^•\-]+[•\-]\s*/, '').trim();
  for (const [name, code] of Object.entries(FOOTBALL_DATA_COMPETITION_CODES)) {
    if (clean === name || clean.includes(name) || raw.includes(name)) return code;
  }
  return null;
}

async function fetchWithRetry(url: string): Promise<Response> {
  if (isFootballDataRateLimited()) {
    const remainingSec = Math.ceil((footballDataRateLimitedUntil - Date.now()) / 1000);
    throw new FootballDataRateLimitError(`Rate limit cooldown active (wait ${remainingSec}s)`);
  }
  const apiKey = getApiKey();
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      headers: { 'X-Auth-Token': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 429) {
      const body = await res.text().catch(() => '');
      if (attempt === 0) {
        await delay(requestSpacingMs());
        continue;
      }
      const waitMatch = body.match(/Wait\s+(\d+)\s+seconds/i);
      const waitSeconds = waitMatch ? parseInt(waitMatch[1], 10) : 10;
      setFootballDataRateLimitCooldown(waitSeconds * 1000);
      throw new FootballDataRateLimitError(body.slice(0, 100));
    }

    return res;
  }
  throw new FootballDataRateLimitError('Exceeded retry limit');
}

export async function fetchStandings(competitionCode: string): Promise<Map<string, StandingsEntry>> {
  const cached = standingsCache.get(competitionCode);
  if (cached && cached.expiresAt > Date.now()) return cached.teams;

  const res = await fetchWithRetry(`${BASE_URL}/competitions/${encodeURIComponent(competitionCode)}/standings`);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Football-Data standings HTTP ${res.status}: ${body.slice(0, 180)}`);
  }

  const data = await res.json() as any;
  const total = Array.isArray(data.standings)
    ? data.standings.find((s: any) => s.type === 'TOTAL') || data.standings[0]
    : null;
  const entries = Array.isArray(total?.table) ? total.table : [];

  const teams = new Map<string, StandingsEntry>();
  for (const entry of entries) {
    const name = entry.team?.name || entry.team?.shortName;
    const rank = Number(entry.position);
    if (!name || !Number.isFinite(rank) || rank < 1) continue;

    const entryData: StandingsEntry = {
      rank,
      points: Number.isFinite(Number(entry.points)) ? Number(entry.points) : null,
      name,
      teamId: entry.team?.id,
    };

    teams.set(normalize(name), entryData);
    if (entry.team?.shortName) {
      teams.set(normalize(entry.team.shortName), entryData);
    }
  }

  standingsCache.set(competitionCode, { expiresAt: Date.now() + CACHE_TTL_MS, teams });
  return teams;
}

export async function fetchFinishedMatches(competitionCode: string): Promise<RawFinishedMatch[]> {
  const cached = matchesCache.get(competitionCode);
  if (cached && cached.expiresAt > Date.now()) return cached.matches;

  const res = await fetchWithRetry(`${BASE_URL}/competitions/${encodeURIComponent(competitionCode)}/matches?status=FINISHED`);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Football-Data matches HTTP ${res.status}: ${body.slice(0, 180)}`);
  }

  const data = await res.json() as any;
  const matches: RawFinishedMatch[] = Array.isArray(data.matches) ? data.matches : [];
  matchesCache.set(competitionCode, { expiresAt: Date.now() + CACHE_TTL_MS, matches });
  return matches;
}

export interface ComputedTeamForm {
  form: ('W' | 'D' | 'L')[];
  formScores: string[];
  formDetails: Array<{
    result: 'W' | 'D' | 'L';
    score: string;
    opponent?: string;
    venue?: 'H' | 'A';
    date?: string;
  }>;
}

export function computeTeamFormFromFinishedMatches(
  teamName: string,
  finishedMatches: RawFinishedMatch[],
  kickoffIso?: string | null
): ComputedTeamForm {
  const targetNorm = normalize(teamName);
  if (!targetNorm) {
    return { form: [], formScores: [], formDetails: [] };
  }

  const cutoffTime = kickoffIso ? new Date(kickoffIso).getTime() : Infinity;

  // Filter matches involving this team that finished strictly before kickoff
  const teamMatches = finishedMatches.filter((m) => {
    if (!m.utcDate || !m.homeTeam || !m.awayTeam || !m.score?.fullTime) return false;
    const matchTime = new Date(m.utcDate).getTime();
    if (matchTime >= cutoffTime) return false;

    return (
      teamNameMatches(teamName, m.homeTeam.name) ||
      (Boolean(m.homeTeam.shortName) && teamNameMatches(teamName, m.homeTeam.shortName!)) ||
      teamNameMatches(teamName, m.awayTeam.name) ||
      (Boolean(m.awayTeam.shortName) && teamNameMatches(teamName, m.awayTeam.shortName!))
    );
  });

  // Sort chronologically ascending (oldest to newest)
  teamMatches.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());

  // Take the most recent up to 5 finished matches
  const recent5 = teamMatches.slice(-5);

  const form: ('W' | 'D' | 'L')[] = [];
  const formScores: string[] = [];
  const formDetails: ComputedTeamForm['formDetails'] = [];

  for (const m of recent5) {
    const isHome =
      teamNameMatches(teamName, m.homeTeam.name) ||
      (Boolean(m.homeTeam.shortName) && teamNameMatches(teamName, m.homeTeam.shortName!));

    const hScore = Number(m.score.fullTime.home ?? 0);
    const aScore = Number(m.score.fullTime.away ?? 0);

    let result: 'W' | 'D' | 'L' = 'D';
    let displayScore = `${hScore}-${aScore}`;
    const opponentName = isHome ? (m.awayTeam.shortName || m.awayTeam.name) : (m.homeTeam.shortName || m.homeTeam.name);
    const venue: 'H' | 'A' = isHome ? 'H' : 'A';

    if (isHome) {
      if (hScore > aScore) result = 'W';
      else if (hScore < aScore) result = 'L';
      else result = 'D';
      displayScore = `${hScore}-${aScore}`;
    } else {
      if (aScore > hScore) result = 'W';
      else if (aScore < hScore) result = 'L';
      else result = 'D';
      displayScore = `${aScore}-${hScore}`;
    }

    form.push(result);
    formScores.push(displayScore);
    formDetails.push({
      result,
      score: displayScore,
      opponent: opponentName,
      venue,
      date: m.utcDate.slice(0, 10),
    });
  }

  return { form, formScores, formDetails };
}

export function computeH2HFromFinishedMatches(
  homeName: string,
  awayName: string,
  finishedMatches: RawFinishedMatch[],
  kickoffIso?: string | null
): H2HRecord | null {
  const homeNorm = normalize(homeName);
  const awayNorm = normalize(awayName);
  if (!homeNorm || !awayNorm) return null;

  const cutoffTime = kickoffIso ? new Date(kickoffIso).getTime() : Infinity;

  const directMatches = finishedMatches.filter((m) => {
    if (!m.utcDate || !m.homeTeam || !m.awayTeam || !m.score?.fullTime) return false;
    const matchTime = new Date(m.utcDate).getTime();
    if (matchTime >= cutoffTime) return false;

    const mHomeNorm = normalize(m.homeTeam.name);
    const mHomeShort = normalize(m.homeTeam.shortName || '');
    const mAwayNorm = normalize(m.awayTeam.name);
    const mAwayShort = normalize(m.awayTeam.shortName || '');

    const isMatchup1 =
      (teamNameMatches(homeName, m.homeTeam.name) || (Boolean(m.homeTeam.shortName) && teamNameMatches(homeName, m.homeTeam.shortName!))) &&
      (teamNameMatches(awayName, m.awayTeam.name) || (Boolean(m.awayTeam.shortName) && teamNameMatches(awayName, m.awayTeam.shortName!)));
    const isMatchup2 =
      (teamNameMatches(awayName, m.homeTeam.name) || (Boolean(m.homeTeam.shortName) && teamNameMatches(awayName, m.homeTeam.shortName!))) &&
      (teamNameMatches(homeName, m.awayTeam.name) || (Boolean(m.awayTeam.shortName) && teamNameMatches(homeName, m.awayTeam.shortName!)));
    return isMatchup1 || isMatchup2;
  });

  if (directMatches.length === 0) return null;

  directMatches.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
  const recent5 = directMatches.slice(-5);

  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  const scoresLast5: string[] = [];

  for (const m of recent5) {
    const isOurHomeAtVenue =
      teamNameMatches(homeName, m.homeTeam.name) || (Boolean(m.homeTeam.shortName) && teamNameMatches(homeName, m.homeTeam.shortName!));

    const hScore = Number(m.score.fullTime.home ?? 0);
    const aScore = Number(m.score.fullTime.away ?? 0);

    scoresLast5.push(`${hScore}-${aScore}`);

    if (hScore === aScore) {
      draws++;
    } else if (isOurHomeAtVenue) {
      if (hScore > aScore) homeWins++;
      else awayWins++;
    } else {
      if (aScore > hScore) homeWins++;
      else awayWins++;
    }
  }

  return {
    homeWins,
    draws,
    awayWins,
    totalLast5: recent5.length,
    scoresLast5,
    source: 'FOOTBALL_DATA_ORG',
  };
}

export async function enrichFixturesWithFootballData(fixtures: MatchFixture[]): Promise<{
  fixtures: MatchFixture[];
  enrichedCount: number;
  skippedCount: number;
  errors: string[];
}> {
  const apiKey = getApiKey();
  if (!apiKey || fixtures.length === 0) {
    return { fixtures, enrichedCount: 0, skippedCount: fixtures.length, errors: apiKey ? [] : ['FOOTBALL_DATA_KEY is not configured'] };
  }

  const grouped = new Map<string, MatchFixture[]>();
  for (const fixture of fixtures) {
    const code = resolveCompetitionCode(fixture.league || '');
    if (!code) continue;
    if (!grouped.has(code)) grouped.set(code, []);
    grouped.get(code)!.push(fixture);
  }

  const standingsMaps = new Map<string, Map<string, StandingsEntry>>();
  const matchesMaps = new Map<string, RawFinishedMatch[]>();
  const errors: string[] = [];

  const codes = Array.from(grouped.keys());
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    try {
      if (i > 0) await delay(requestSpacingMs());
      const standings = await fetchStandings(code);
      standingsMaps.set(code, standings);

      await delay(requestSpacingMs());
      const finishedMatches = await fetchFinishedMatches(code);
      matchesMaps.set(code, finishedMatches);
    } catch (err) {
      if (err instanceof FootballDataRateLimitError) {
        console.warn(`[Football-Data] Rate limit reached; skipping remaining ${codes.length - i} leagues in batch`);
        errors.push(`Rate limit reached on ${code}: ${err.message}`);
        break;
      }
      errors.push(`${code}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  let enrichedCount = 0;
  const enriched = fixtures.map((fixture) => {
    const code = resolveCompetitionCode(fixture.league || '');
    const standings = code ? standingsMaps.get(code) : undefined;
    const matches = code ? matchesMaps.get(code) : undefined;

    if (!standings && !matches) return fixture;

    const homeNorm = normalize(fixture.homeTeam.name);
    const awayNorm = normalize(fixture.awayTeam.name);

    const homeStanding = standings ? findStandingForTeam(fixture.homeTeam.name, fixture.homeTeam.shortName, standings) : undefined;
    const awayStanding = standings ? findStandingForTeam(fixture.awayTeam.name, fixture.awayTeam.shortName, standings) : undefined;

    const homeFormRes = matches ? computeTeamFormFromFinishedMatches(fixture.homeTeam.name, matches, fixture.kickoffTime) : null;
    const awayFormRes = matches ? computeTeamFormFromFinishedMatches(fixture.awayTeam.name, matches, fixture.kickoffTime) : null;
    const realH2H = matches ? computeH2HFromFinishedMatches(fixture.homeTeam.name, fixture.awayTeam.name, matches, fixture.kickoffTime) : null;

    const homeStandingAlreadyVerified =
      Boolean(fixture.homeTeam.standingsSource) && Number.isFinite(fixture.homeTeam.leagueRank) && fixture.homeTeam.leagueRank >= 1;
    const awayStandingAlreadyVerified =
      Boolean(fixture.awayTeam.standingsSource) && Number.isFinite(fixture.awayTeam.leagueRank) && fixture.awayTeam.leagueRank >= 1;
    const homeFormAlreadyVerified =
      Boolean(fixture.homeTeam.formSource) && Array.isArray(fixture.homeTeam.form) && fixture.homeTeam.form.length > 0;
    const awayFormAlreadyVerified =
      Boolean(fixture.awayTeam.formSource) && Array.isArray(fixture.awayTeam.form) && fixture.awayTeam.form.length > 0;

    // Football-Data.org is a secondary fallback. Never overwrite primary-provider
    // evidence (SportAPI.ai/Sportmonks) or any other already-verified source.
    const usableHomeStanding = homeStandingAlreadyVerified ? null : homeStanding;
    const usableAwayStanding = awayStandingAlreadyVerified ? null : awayStanding;
    const usableHomeForm = homeFormAlreadyVerified ? null : homeFormRes;
    const usableAwayForm = awayFormAlreadyVerified ? null : awayFormRes;

    const finalHomeStandingValid = homeStandingAlreadyVerified || Boolean(usableHomeStanding);
    const finalAwayStandingValid = awayStandingAlreadyVerified || Boolean(usableAwayStanding);
    const bothStandingsVerified = finalHomeStandingValid && finalAwayStandingValid;
    const didEnrich =
      Boolean(usableHomeStanding) ||
      Boolean(usableAwayStanding) ||
      Boolean(usableHomeForm?.form.length) ||
      Boolean(usableAwayForm?.form.length) ||
      (!fixture.h2h?.source && realH2H !== null);

    if (!didEnrich) {
      return fixture;
    }

    enrichedCount++;

    const nowIso = new Date().toISOString();
    const fallbackProvidedBothStandings = Boolean(usableHomeStanding && usableAwayStanding);
    const authenticity: MatchAuthenticityStamp = fixture.authenticity || (fallbackProvidedBothStandings
      ? {
          status: 'VERIFIED_AUTHENTIC',
          authenticityScore: 100,
          isAuthentic: true,
          verifiedAt: nowIso,
          source: 'FOOTBALL_DATA_ORG',
          checks: [
            {
              checkName: 'Official League Table Cross-Reference',
              passed: true,
              details: `Ranks verified from Football-Data.org: ${fixture.homeTeam.name} (#${usableHomeStanding?.rank}) vs ${fixture.awayTeam.name} (#${usableAwayStanding?.rank})`,
              severity: 'critical',
            },
            {
              checkName: 'Recent Finished Matches Form',
              passed: true,
              details: `Form computed from finished matches: Home [${usableHomeForm?.form.join('') || fixture.homeTeam.form.join('') || 'none'}] Away [${usableAwayForm?.form.join('') || fixture.awayTeam.form.join('') || 'none'}]`,
              severity: 'info',
            },
          ],
        }
      : fixture.authenticity);

    return {
      ...fixture,
      homeTeam: {
        ...fixture.homeTeam,
        ...(usableHomeStanding ? { leagueRank: usableHomeStanding.rank, points: usableHomeStanding.points, standingsSource: 'FOOTBALL_DATA_ORG' as const } : {}),
        ...(usableHomeForm && usableHomeForm.form.length > 0
          ? { form: usableHomeForm.form, formSource: 'FOOTBALL_DATA_ORG' as const, formScores: usableHomeForm.formScores, formDetails: usableHomeForm.formDetails }
          : {}),
      },
      awayTeam: {
        ...fixture.awayTeam,
        ...(usableAwayStanding ? { leagueRank: usableAwayStanding.rank, points: usableAwayStanding.points, standingsSource: 'FOOTBALL_DATA_ORG' as const } : {}),
        ...(usableAwayForm && usableAwayForm.form.length > 0
          ? { form: usableAwayForm.form, formSource: 'FOOTBALL_DATA_ORG' as const, formScores: usableAwayForm.formScores, formDetails: usableAwayForm.formDetails }
          : {}),
      },
      h2h: (!fixture.h2h?.source && realH2H !== null) ? realH2H : fixture.h2h,
      isStandingsVerified: bothStandingsVerified,
      authenticity,
    };
  });

  return {
    fixtures: enriched,
    enrichedCount,
    skippedCount: fixtures.length - enrichedCount,
    errors,
  };
}
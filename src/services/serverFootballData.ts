import type { MatchFixture } from '../types/soccer';

const BASE_URL = 'https://api.football-data.org/v4';
const API_KEY = process.env.FOOTBALL_DATA_KEY?.trim() || '';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const standingsCache = new Map<string, { expiresAt: number; teams: Map<string, { rank: number; points: number | null; form: ('W' | 'D' | 'L')[] }> }>();

export const FOOTBALL_DATA_COMPETITION_CODES: Record<string, string> = {
  'premier league': 'PL',
  'england premier league': 'PL',
  'la liga': 'PD',
  'primera division': 'PD',
  'serie a': 'SA',
  'bundesliga': 'BL1',
  '1. bundesliga': 'BL1',
  'ligue 1': 'FL1',
  'championship': 'ELC',
  'english championship': 'ELC',
  'eredivisie': 'DED',
  'primeira liga': 'PPL',
  'portuguese primeira liga': 'PPL',
  'champions league': 'CL',
  'uefa champions league': 'CL',
};

export function footballDataConfigured(): boolean {
  return API_KEY.length > 0;
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function resolveCompetitionCode(league: string): string | null {
  const clean = league.toLowerCase().replace(/^[^•]+•\s*/, '').trim();
  for (const [name, code] of Object.entries(FOOTBALL_DATA_COMPETITION_CODES)) {
    if (clean === name || clean.includes(name)) return code;
  }
  return null;
}

async function fetchStandings(competitionCode: string) {
  const cached = standingsCache.get(competitionCode);
  if (cached && cached.expiresAt > Date.now()) return cached.teams;

  const res = await fetch(`${BASE_URL}/competitions/${encodeURIComponent(competitionCode)}/standings`, {
    headers: { 'X-Auth-Token': API_KEY, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Football-Data standings HTTP ${res.status}: ${body.slice(0, 180)}`);
  }

  const data = await res.json() as any;
  const total = Array.isArray(data.standings)
    ? data.standings.find((s: any) => s.type === 'TOTAL') || data.standings[0]
    : null;
  const entries = Array.isArray(total?.table) ? total.table : [];

  const teams = new Map<string, { rank: number; points: number | null; form: ('W' | 'D' | 'L')[] }>();
  for (const entry of entries) {
    const name = entry.team?.name || entry.team?.shortName;
    const rank = Number(entry.position);
    if (!name || !Number.isFinite(rank) || rank < 1) continue;
    const rawForm = typeof entry.form === 'string'
      ? entry.form.split('').filter((x: string) => x === 'W' || x === 'D' || x === 'L')
      : [];
    teams.set(normalize(name), {
      rank,
      points: Number.isFinite(Number(entry.points)) ? Number(entry.points) : null,
      form: rawForm.slice(-5) as ('W' | 'D' | 'L')[],
    });
  }

  standingsCache.set(competitionCode, { expiresAt: Date.now() + CACHE_TTL_MS, teams });
  return teams;
}

export async function enrichFixturesWithFootballData(fixtures: MatchFixture[]): Promise<{
  fixtures: MatchFixture[];
  enrichedCount: number;
  skippedCount: number;
  errors: string[];
}> {
  if (!API_KEY || fixtures.length === 0) {
    return { fixtures, enrichedCount: 0, skippedCount: fixtures.length, errors: API_KEY ? [] : ['FOOTBALL_DATA_KEY is not configured'] };
  }

  const grouped = new Map<string, MatchFixture[]>();
  for (const fixture of fixtures) {
    const code = resolveCompetitionCode(fixture.league || '');
    if (!code) continue;
    if (!grouped.has(code)) grouped.set(code, []);
    grouped.get(code)!.push(fixture);
  }

  const maps = new Map<string, Map<string, { rank: number; points: number | null; form: ('W' | 'D' | 'L')[] }>>();
  const errors: string[] = [];

  for (const [code] of grouped) {
    try {
      maps.set(code, await fetchStandings(code));
    } catch (err) {
      errors.push(`${code}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  let enrichedCount = 0;
  const enriched = fixtures.map((fixture) => {
    const code = resolveCompetitionCode(fixture.league || '');
    const standings = code ? maps.get(code) : undefined;
    if (!standings) return fixture;

    const home = standings.get(normalize(fixture.homeTeam.name));
    const away = standings.get(normalize(fixture.awayTeam.name));
    if (!home && !away) return fixture;

    const next = {
      ...fixture,
      homeTeam: {
        ...fixture.homeTeam,
        ...(home ? { leagueRank: home.rank, points: home.points, form: home.form } : {}),
      },
      awayTeam: {
        ...fixture.awayTeam,
        ...(away ? { leagueRank: away.rank, points: away.points, form: away.form } : {}),
      },
      isStandingsVerified: Boolean(home && away),
    };
    if (home || away) enrichedCount++;
    return next;
  });

  return {
    fixtures: enriched,
    enrichedCount,
    skippedCount: fixtures.length - enrichedCount,
    errors,
  };
}

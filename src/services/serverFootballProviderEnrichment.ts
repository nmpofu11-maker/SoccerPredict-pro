import type { MatchFixture, TeamStats, H2HRecord } from '../types/soccer';
import { ALL_LEAGUES_DIRECTORY } from '../constants/leagues';
import {
  apiFootballConfigured,
  sportmonksConfigured,
  apiFootballGet,
  fetchApiFootballFixturesByDate,
  fetchApiFootballHeadToHead,
  fetchSportmonksFixturesByDate,
  fetchSportmonksFixturesBetweenForTeam,
  fetchSportmonksTeamsBySearch,
  fetchSportmonksStandingsBySeason,
  fetchSportmonksHeadToHead,
} from './serverFootballApis';
import {
  sportApiAiConfigured,
  fetchSportApiAiFixturesByDate,
  fetchSportApiAiTeam,
  fetchSportApiAiStandings,
  fetchSportApiAiFixtureStats,
  fetchSportApiAiHeadToHead,
} from './serverSportApiAi';

const TEAM_STATS_TTL_MS = 60 * 60 * 1000;
const teamStatsCache = new Map<string, { expiresAt: number; value: any }>();
const standingsCache = new Map<string, { expiresAt: number; value: Map<string, { rank: number; points: number | null }> }>();

export function isValidPositiveInteger(val: any): boolean {
  if (val === undefined || val === null) return false;
  const num = Number(val);
  if (!Number.isInteger(num)) return false;
  if (num <= 0) return false;
  return true;
}

export function normalizeProviderTeamName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|cf|sc|afc|club)\b/g, '').replace(/[^a-z0-9]/g, '');
}

export function extractSportmonksParticipant(raw: any, side: 'home' | 'away'): any {
  const participants = Array.isArray(raw?.participants?.data)
    ? raw.participants.data
    : (Array.isArray(raw?.participants) ? raw.participants : []);
  return participants.find((p: any) =>
    String(p?.meta?.location || p?.pivot?.location || '').toLowerCase() === side
  ) || null;
}

export function findMatchingSlateFixtures(mapped: MatchFixture, enriched: MatchFixture[]): MatchFixture[] {
  const normCandHome = normalizeProviderTeamName(mapped.homeTeam.name);
  const normCandAway = normalizeProviderTeamName(mapped.awayTeam.name);
  const candKickoffMs = Date.parse(mapped.kickoffTime);

  return enriched.filter((f) => {
    const fHome = normalizeProviderTeamName(f.homeTeam.name);
    const fAway = normalizeProviderTeamName(f.awayTeam.name);
    if (fHome !== normCandHome || fAway !== normCandAway) return false;

    // Time difference check within 3 hours
    const fKickoffMs = Date.parse(f.kickoffTime);
    if (Number.isFinite(candKickoffMs) && Number.isFinite(fKickoffMs)) {
      if (Math.abs(candKickoffMs - fKickoffMs) > 3 * 3600 * 1000) return false;
    } else {
      return false;
    }

    // Competition compatibility check
    if (!areCompetitionsCompatible(f.league, f.competition, mapped.competition || mapped.league)) {
      return false;
    }

    return true;
  });
}

function teamStatsFromApiFootball(
  source: any,
  rank?: { rank: number; points: number | null }
): Partial<TeamStats> {
  const rawForm = typeof source?.form === 'string' ? source.form.toUpperCase() : '';
  const form = rawForm.split('').filter((v: string) => v === 'W' || v === 'D' || v === 'L').slice(-5) as ('W'|'D'|'L')[];
  return {
    ...(rank ? { leagueRank: rank.rank, points: rank.points, standingsSource: 'API_FOOTBALL' as const } : {}),
    ...(form.length ? { form, formSource: 'API_FOOTBALL' as const } : {}),
  };
}

function parseApiFootballStandings(body: any): Map<string, { rank: number; points: number | null }> {
  const out = new Map<string, { rank: number; points: number | null; form?: ('W' | 'D' | 'L')[] }>();
  const response = Array.isArray(body?.response) ? body.response : [];
  for (const block of response) {
    const groups = block?.league?.standings;
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!Array.isArray(group)) continue;
      for (const row of group) {
        const teamId = row?.team?.id;
        const rank = Number(row?.rank);
        const points = Number(row?.points);
        if (teamId && Number.isInteger(rank) && rank > 0) {
          out.set(String(teamId), { rank, points: Number.isFinite(points) ? points : null });
        }
      }
    }
  }
  return out;
}

async function getApiFootballStandings(leagueId: number, season: number): Promise<Map<string, { rank: number; points: number | null }>> {
  const key = `${leagueId}:${season}`;
  const cached = standingsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const body = await apiFootballGet('standings', { league: leagueId, season });
  const result = parseApiFootballStandings(body);
  standingsCache.set(key, { expiresAt: Date.now() + TEAM_STATS_TTL_MS, value: result });
  return result;
}

async function getApiFootballTeamStats(teamId: number, leagueId: number, season: number): Promise<any> {
  const key = `${teamId}:${leagueId}:${season}`;
  const cached = teamStatsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const body = await apiFootballGet('teams/statistics', { team: teamId, league: leagueId, season });
  const value = body?.response ?? null;
  teamStatsCache.set(key, { expiresAt: Date.now() + TEAM_STATS_TTL_MS, value });
  return value;
}

function isCompletedOrCancelledStatus(status: unknown): boolean {
  const value = typeof status === 'string' ? status.toUpperCase() : '';
  return ['FT', 'AET', 'PEN', 'CANC', 'ABD', 'AWD', 'WO', 'PST'].includes(value) ||
    /finished|full time|completed|cancelled|abandoned|postponed/i.test(value);
}

function mapApiFootballFixture(raw: any): MatchFixture | null {
  const fixture = raw?.fixture;
  if (isCompletedOrCancelledStatus(fixture?.status?.short)) return null;
  const home = raw?.teams?.home;
  const away = raw?.teams?.away;
  const league = raw?.league;
  const kickoffTime = typeof fixture?.date === 'string' && /[T ]\d{2}:\d{2}/.test(fixture.date) ? new Date(fixture.date) : null;
  if (!fixture?.id || !home?.id || !away?.id || !home?.name || !away?.name ||
      !kickoffTime || !Number.isFinite(kickoffTime.getTime()) || !league?.name ||
      kickoffTime.getTime() < Date.now() - 3 * 60 * 60 * 1000) return null;
  const name = league.country ? `${league.country} • ${league.name}` : league.name;
  const makeTeam = (team: any, side: 'home' | 'away'): TeamStats => ({
    id: `api_football_team_${team.id}`,
    name: team.name,
    shortName: team.name.slice(0, 3).toUpperCase(),
    leagueRank: null,
    points: null,
    form: [],
    avgPossession: null,
    avgShotsOnTarget: null,
    ...(side === 'home' ? { isHomeDominant: false } : { hasTopTierAwayForm: false }),
  });
  return {
    id: `api_football_${fixture.id}`,
    kickoffTime: kickoffTime.toISOString(),
    league: name,
    competition: league.name,
    venue: fixture.venue?.name || 'Unknown Venue',
    round: league.round || undefined,
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: makeTeam(home, 'home'),
    awayTeam: makeTeam(away, 'away'),
    h2h: null,
    automationSource: 'API_FOOTBALL',
    apiFootballFixtureId: String(fixture.id),
    apiFootballLeagueId: Number(league.id),
    apiFootballSeason: Number(league.season),
    apiFootballHomeTeamId: Number(home.id),
    apiFootballAwayTeamId: Number(away.id),
  } as MatchFixture;
}

function mapSportmonksFixture(raw: any): MatchFixture | null {
  const fixtureId = raw?.id;
  const state = raw?.state?.data || raw?.state;
  if (isCompletedOrCancelledStatus(state?.short_name || state?.name)) return null;
  const home = extractSportmonksParticipant(raw, 'home');
  const away = extractSportmonksParticipant(raw, 'away');
  const kickoffTime = typeof raw?.starting_at === 'string' && /[T ]\d{2}:\d{2}/.test(raw.starting_at) ? new Date(raw.starting_at) : null;
  const leagueName = raw?.league?.data?.name || raw?.league?.name;
  if (!fixtureId || !home?.id || !away?.id || !home?.name || !away?.name || !kickoffTime ||
      !Number.isFinite(kickoffTime.getTime()) || kickoffTime.getTime() < Date.now() - 3 * 60 * 60 * 1000 ||
      typeof leagueName !== 'string') return null;

  const homeIdNum = Number(home.id);
  const awayIdNum = Number(away.id);
  if (!Number.isInteger(homeIdNum) || homeIdNum <= 0 || !Number.isInteger(awayIdNum) || awayIdNum <= 0) return null;

  const makeTeam = (team: any, side: 'home' | 'away'): TeamStats => ({
    id: `sportmonks_team_${team.id || normalizeProviderTeamName(team.name)}`,
    name: team.name,
    shortName: team.name.slice(0, 3).toUpperCase(),
    leagueRank: null,
    points: null,
    form: [],
    avgPossession: null,
    avgShotsOnTarget: null,
    ...(side === 'home' ? { isHomeDominant: false } : { hasTopTierAwayForm: false }),
  });
  return {
    id: `sportmonks_${fixtureId}`,
    kickoffTime: kickoffTime.toISOString(),
    league: leagueName,
    competition: leagueName,
    venue: raw?.venue?.data?.name || raw?.venue?.name || 'Unknown Venue',
    round: raw?.round?.name || raw?.round?.data?.name || undefined,
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: makeTeam(home, 'home'),
    awayTeam: makeTeam(away, 'away'),
    h2h: null,
    automationSource: 'SPORTMONKS',
    sportmonksFixtureId: String(fixtureId),
    sportmonksLeagueId: Number(raw?.league_id || raw?.league?.data?.id || raw?.league?.id) || undefined,
    sportMonksSeasonId: Number(raw?.season_id || raw?.season) || undefined,
    sportmonksHomeTeamId: homeIdNum,
    sportmonksAwayTeamId: awayIdNum,
  } as MatchFixture;
}


const sportApiTeamCache = new Map<string, { expiresAt: number; value: any }>();
const sportApiStandingsCache = new Map<string, { expiresAt: number; value: Map<string, { rank: number; points: number | null; form?: ('W' | 'D' | 'L')[] }> }>();
const sportApiFixtureStatsCache = new Map<string, { expiresAt: number; value: any }>();
const sportApiH2HCache = new Map<string, { expiresAt: number; value: any }>();
const sportmonksTeamFixturesCache = new Map<string, { expiresAt: number; value: any[] }>();
const sportmonksTeamSearchCache = new Map<string, { expiresAt: number; value: any[] }>();
const sportmonksStandingsCache = new Map<string, { expiresAt: number; value: Map<string, { rank: number; points: number | null; form?: ('W' | 'D' | 'L')[] }> }>();
const sportmonksH2HCache = new Map<string, { expiresAt: number; value: any[] }>();

const PROVIDER_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_TEAM_LOOKUP_LIMIT = 80;
const DEFAULT_H2H_LOOKUP_LIMIT = 40;
const DEFAULT_MATCH_STAT_LOOKUP_LIMIT = 120;

function providerLimit(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function finiteNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function providerDateFromKickoff(kickoffIso: string, deltaDays: number): string {
  return new Date(Date.parse(kickoffIso) + deltaDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function normalizeStatCode(value: unknown): string {
  return typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') : '';
}

function extractArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function extractSportApiTeamMatches(body: any): any[] {
  const candidates = [
    body?.team?.matches,
    body?.matches,
    body?.data?.matches,
    body?.data?.team?.matches,
    body?.team?.recent_matches,
    body?.recent_matches,
  ];
  return candidates.find(Array.isArray) || [];
}

function extractGenericTeamName(team: any): string {
  return typeof team === 'string' ? team : (team?.name || '');
}

function extractGenericTeamId(team: any): string {
  const id = typeof team === 'object' && team ? (team.id ?? team.team_id) : null;
  return id !== null && id !== undefined ? String(id) : '';
}

function extractScorePair(raw: any): { home: number; away: number } | null {
  const directPairs = [
    [raw?.home_score, raw?.away_score],
    [raw?.homeScore, raw?.awayScore],
    [raw?.score?.home, raw?.score?.away],
    [raw?.goals?.home, raw?.goals?.away],
    [raw?.score?.fulltime?.home, raw?.score?.fulltime?.away],
    [raw?.score?.fullTime?.home, raw?.score?.fullTime?.away],
  ];
  for (const pair of directPairs) {
    const home = finiteNumber(pair[0]);
    const away = finiteNumber(pair[1]);
    if (home !== null && away !== null) return { home, away };
  }

  const scores = raw?.scores?.data ?? raw?.scores;
  if (Array.isArray(scores)) {
    const current = scores.filter((entry: any) => String(entry?.description || '').toUpperCase() === 'CURRENT');
    const rows = current.length ? current : scores;
    let home: number | null = null;
    let away: number | null = null;
    for (const entry of rows) {
      const score = entry?.score ?? entry;
      const participant = String(score?.participant ?? entry?.participant ?? '').toLowerCase();
      const goals = finiteNumber(score?.goals ?? score?.value ?? entry?.goals);
      if (goals === null) continue;
      if (participant === 'home' || participant === '1') home = goals;
      if (participant === 'away' || participant === '2') away = goals;
    }
    if (home !== null && away !== null) return { home, away };
  }
  return null;
}

function fixtureParticipantForSide(raw: any, side: 'home' | 'away'): any {
  const direct = side === 'home' ? (raw?.home_team ?? raw?.teams?.home) : (raw?.away_team ?? raw?.teams?.away);
  if (direct) return direct;
  const participants = extractArray(raw?.participants?.data ?? raw?.participants);
  return participants.find((p: any) => String(p?.meta?.location || p?.pivot?.location || '').toLowerCase() === side) || null;
}

function teamSideForFixture(raw: any, teamId: string, teamName: string): 'home' | 'away' | null {
  const targetId = String(teamId || '');
  const targetName = normalizeProviderTeamName(teamName);
  const matches = (side: any) => {
    if (!side) return false;
    const sideId = extractGenericTeamId(side);
    const sideName = extractGenericTeamName(side);
    return (targetId && sideId && targetId === sideId) ||
      (targetName && sideName && normalizeProviderTeamName(sideName) === targetName);
  };
  if (matches(fixtureParticipantForSide(raw, 'home'))) return 'home';
  if (matches(fixtureParticipantForSide(raw, 'away'))) return 'away';
  return null;
}

function isTargetTeamInFixture(raw: any, teamId: string, teamName: string): boolean {
  return teamSideForFixture(raw, teamId, teamName) !== null;
}

function completedProviderMatch(raw: any, kickoffIso: string): boolean {
  if (!raw) return false;
  const dateValue = raw.datetime || raw.kickoff_time || raw.utc_date || raw.starting_at || raw.date ||
    raw.fixture?.date || raw.fixture?.kickoff_time || raw.fixture?.starting_at;
  const matchTime = dateValue ? Date.parse(String(dateValue)) : NaN;
  if (!Number.isFinite(matchTime) || matchTime >= Date.parse(kickoffIso)) return false;
  const status = String(raw.status || raw.state?.short_name || raw.state?.name || raw.status_short || '').toUpperCase();
  if (['LIVE', 'IN PLAY', 'SCHEDULED', 'NS', 'TBA', 'POSTPONED', 'PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(status)) return false;
  return extractScorePair(raw) !== null;
}

function historicalCompetitionName(raw: any): string {
  return normalizeCompetitionName(
    raw?.league?.data?.name || raw?.league?.name || raw?.league_name ||
    raw?.competition?.name || raw?.competition ||
    raw?.league
  );
}

function isEligibleHistoricalCompetition(
  targetLeague: string | undefined,
  targetCompetition: string | undefined,
  raw: any
): boolean {
  const target = normalizeCompetitionName(targetCompetition || targetLeague);
  const historical = historicalCompetitionName(raw);
  if (!target || !historical) return false;

  // Historical evidence must stay within the target competition family.
  // Exclude cups, friendlies, simulated/SRL feeds and unknown competitions.
  if (
    /(^|\s)(cup|cups|friendly|friendlies|srl|simulated|simulation|esoccer|e-soccer|virtual)(\s|$)/i.test(historical) ||
    /\b(super cup|community shield|trophy)\b/i.test(historical)
  ) {
    return false;
  }

  return areCompetitionsCompatible(targetLeague, targetCompetition, historical);
}

function eligibleHistoricalMatches(
  matches: any[],
  fixture: { league?: string; competition?: string },
  kickoffIso: string
): any[] {
  return matches.filter((m) =>
    completedProviderMatch(m, kickoffIso) &&
    isEligibleHistoricalCompetition(fixture.league, fixture.competition, m)
  );
}

function summarizeFormFromMatches(
  teamName: string,
  teamId: string,
  matches: any[],
  kickoffIso: string,
  source: 'SPORTMONKS' | 'SPORTAPI_AI',
  targetLeague?: string,
  targetCompetition?: string
): Partial<TeamStats> {
  const relevant = eligibleHistoricalMatches(
    matches,
    { league: targetLeague, competition: targetCompetition },
    kickoffIso
  ).filter((m) => isTargetTeamInFixture(m, teamId, teamName));
  relevant.sort((a, b) => Date.parse(String(a.datetime || a.utc_date || a.starting_at || a.date || '')) -
    Date.parse(String(b.datetime || b.utc_date || b.starting_at || b.date || '')));
  const recent = relevant.slice(-5);
  const form: ('W' | 'D' | 'L')[] = [];
  const formDetails: NonNullable<TeamStats['formDetails']> = [];

  for (const match of recent) {
    const pair = extractScorePair(match);
    const side = teamSideForFixture(match, teamId, teamName);
    if (!pair || !side) continue;
    const result: 'W' | 'D' | 'L' = pair.home === pair.away
      ? 'D'
      : side === 'home'
        ? (pair.home > pair.away ? 'W' : 'L')
        : (pair.away > pair.home ? 'W' : 'L');
    const opponentRaw = side === 'home' ? fixtureParticipantForSide(match, 'away') : fixtureParticipantForSide(match, 'home');
    form.push(result);
    formDetails.push({
      result,
      score: side === 'home' ? String(pair.home) + '-' + String(pair.away) : String(pair.away) + '-' + String(pair.home),
      opponent: extractGenericTeamName(opponentRaw) || undefined,
      venue: side === 'home' ? 'H' : 'A',
      date: String(match.datetime || match.utc_date || match.starting_at || match.date || '').slice(0, 10) || undefined,
    });
  }

  return form.length ? { form, formSource: source, formDetails } : {};
}

function extractSportmonksStatisticValue(row: any): number | null {
  const candidates = [row?.data?.value, row?.data?.value?.value, row?.value, row?.statistic?.value];
  for (const candidate of candidates) {
    const value = finiteNumber(candidate);
    if (value !== null) return value;
  }
  return null;
}

function extractSportmonksStatForTeam(
  fixture: any,
  teamId: string,
  typeCodes: string[],
  typeIds: number[]
): number | null {
  const stats = fixture?.statistics?.data ?? fixture?.statistics;
  if (!Array.isArray(stats)) return null;
  const participants = extractArray(fixture?.participants?.data ?? fixture?.participants);
  for (const row of stats) {
    const code = normalizeStatCode(row?.type?.code || row?.type?.data?.code || row?.code);
    const typeId = finiteNumber(row?.type_id || row?.type?.id || row?.type?.data?.id);
    const participantId = row?.participant_id ?? row?.participant?.id ?? row?.participant?.data?.id;
    const location = String(
      row?.location ||
      row?.participant?.meta?.location ||
      participants.find((p: any) => String(p?.id) === String(participantId))?.meta?.location ||
      ''
    ).toLowerCase();
    const wantedType = typeCodes.includes(code) || (typeId !== null && typeIds.includes(typeId));
    const correctTeam = String(participantId ?? '') === String(teamId);
    if (wantedType && correctTeam) return extractSportmonksStatisticValue(row);
  }
  return null;
}

function sportmonksXGForTeam(fixture: any, teamId: string): number | null {
  const raw = fixture?.xGFixture?.data ?? fixture?.xGFixture;
  if (!raw) return null;
  const participants = extractArray(fixture?.participants?.data ?? fixture?.participants);
  const side = participants.find((p: any) => String(p?.id) === String(teamId))?.meta?.location;
  const candidates = [
    raw,
    raw?.expected,
    raw?.data,
    raw?.data?.expected,
  ];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const entry of candidate) {
      const participantId = entry?.participant_id ?? entry?.participant?.id ?? entry?.participant?.data?.id;
      const location = String(entry?.location || entry?.participant?.meta?.location || '').toLowerCase();
      if (String(participantId ?? '') !== String(teamId) && location !== String(side || '').toLowerCase()) continue;
      const value = finiteNumber(entry?.expected_goals ?? entry?.xg ?? entry?.value ?? entry?.data?.value);
      if (value !== null) return value;
    }
  }
  const direct = side === 'home'
    ? (raw?.home ?? raw?.home_xg ?? raw?.home_expected_goals)
    : side === 'away'
      ? (raw?.away ?? raw?.away_xg ?? raw?.away_expected_goals)
      : null;
  return finiteNumber(direct?.value ?? direct);
}
function sportmonksStandingMap(rows: any[]): Map<string, { rank: number; points: number | null; form?: ('W' | 'D' | 'L')[] }> {
  const out = new Map<string, { rank: number; points: number | null }>();
  for (const row of rows) {
    const rank = finiteNumber(row?.position ?? row?.rank);
    const points = finiteNumber(row?.points);
    const id = row?.participant_id ?? row?.team_id ?? row?.participant?.id ?? row?.participant?.data?.id;
    const name = row?.participant?.name ?? row?.participant?.data?.name ?? row?.team_name ?? row?.name;
    if (rank === null || rank < 1) continue;
    const rawForm = Array.isArray(row?.form) ? row.form : typeof row?.form === 'string' ? row.form.split('') : [];
    const form = rawForm.filter((v: any) => v === 'W' || v === 'D' || v === 'L').slice(-5) as ('W'|'D'|'L')[];
    const value = { rank: Math.trunc(rank), points, ...(form.length ? { form } : {}) };
    if (id !== undefined && id !== null) out.set(String(id), value);
    if (typeof name === 'string' && name) out.set('name:' + normalizeProviderTeamName(name), value);
  }
  return out;
}

function sportApiStandingMap(rows: any[]): Map<string, { rank: number; points: number | null; form?: ('W' | 'D' | 'L')[] }> {
  const out = new Map<string, { rank: number; points: number | null }>();
  for (const row of rows) {
    const rank = finiteNumber(row?.position ?? row?.rank);
    const points = finiteNumber(row?.points);
    const id = row?.team_id ?? row?.team?.id ?? row?.id;
    const name = row?.team_name ?? row?.team?.name ?? row?.name;
    if (rank === null || rank < 1) continue;
    const rawForm = Array.isArray(row?.form) ? row.form : typeof row?.form === 'string' ? row.form.split('') : [];
    const form = rawForm.filter((v: any) => v === 'W' || v === 'D' || v === 'L').slice(-5) as ('W'|'D'|'L')[];
    const value = { rank: Math.trunc(rank), points, ...(form.length ? { form } : {}) };
    if (id !== undefined && id !== null) out.set(String(id), value);
    if (typeof name === 'string' && name) out.set('name:' + normalizeProviderTeamName(name), value);
  }
  return out;
}

function findProviderStanding(
  map: Map<string, { rank: number; points: number | null; form?: ('W' | 'D' | 'L')[] }>,
  teamId: string,
  teamName: string
): { rank: number; points: number | null; form?: ('W' | 'D' | 'L')[] } | undefined {
  return map.get(String(teamId || '')) || map.get('name:' + normalizeProviderTeamName(teamName));
}

function extractProviderH2HFixtures(body: any): any[] {
  if (Array.isArray(body?.fixtures)) return body.fixtures;
  if (Array.isArray(body?.data?.fixtures)) return body.data.fixtures;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.matches)) return body.matches;
  return [];
}

function buildH2HFromProviderFixtures(
  homeTeamId: string,
  awayTeamId: string,
  homeName: string,
  awayName: string,
  fixtures: any[],
  kickoffIso: string,
  source: 'SPORTMONKS' | 'SPORTAPI_AI' | 'API_FOOTBALL'
): H2HRecord | null {
  const pair = fixtures.filter((m) => {
    if (!completedProviderMatch(m, kickoffIso)) return false;
    const homeParticipant = fixtureParticipantForSide(m, 'home');
    const awayParticipant = fixtureParticipantForSide(m, 'away');
    const hId = extractGenericTeamId(homeParticipant);
    const aId = extractGenericTeamId(awayParticipant);
    const hName = normalizeProviderTeamName(extractGenericTeamName(homeParticipant));
    const aName = normalizeProviderTeamName(extractGenericTeamName(awayParticipant));
    const homeNorm = normalizeProviderTeamName(homeName);
    const awayNorm = normalizeProviderTeamName(awayName);
    return (homeTeamId && awayTeamId && hId === homeTeamId && aId === awayTeamId) ||
      (homeTeamId && awayTeamId && hId === awayTeamId && aId === homeTeamId) ||
      (hName === homeNorm && aName === awayNorm) ||
      (hName === awayNorm && aName === homeNorm);
  });

  pair.sort((a, b) => Date.parse(String(a.datetime || a.utc_date || a.starting_at || a.date || '')) -
    Date.parse(String(b.datetime || b.utc_date || b.starting_at || b.date || '')));
  const recent = pair.slice(-5);
  if (!recent.length) return null;

  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  const scoresLast5: string[] = [];
  for (const match of recent) {
    const score = extractScorePair(match);
    if (!score) continue;
    const side = teamSideForFixture(match, homeTeamId, homeName);
    if (score.home === score.away) draws++;
    else if (side === 'home') score.home > score.away ? homeWins++ : awayWins++;
    else if (side === 'away') score.away > score.home ? homeWins++ : awayWins++;
    else {
      const matchHome = normalizeProviderTeamName(extractGenericTeamName(fixtureParticipantForSide(match, 'home')));
      if (matchHome === normalizeProviderTeamName(homeName)) score.home > score.away ? homeWins++ : awayWins++;
      else score.away > score.home ? homeWins++ : awayWins++;
    }
    scoresLast5.push(String(score.home) + '-' + String(score.away));
  }

  const totalLast5 = homeWins + awayWins + draws;
  return totalLast5 ? { homeWins, draws, awayWins, totalLast5, scoresLast5, source } : null;
}



export function providerTeamNameSimilarity(target: string, candidate: string): number {
  const a = normalizeProviderTeamName(target);
  const b = normalizeProviderTeamName(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return shorter / longer;
  }

  const tokens = (value: string) => value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|cf|sc|afc|club)\b/g, ' ')
    .split(/[^a-z0-9]+/)
    .map((v) => v.trim())
    .filter((v) => v.length >= 4);
  const targetTokens = new Set(tokens(target));
  const candidateTokens = new Set(tokens(candidate));
  if (!targetTokens.size || !candidateTokens.size) return 0;
  let overlap = 0;
  for (const token of targetTokens) if (candidateTokens.has(token)) overlap++;
  return overlap / Math.max(targetTokens.size, candidateTokens.size);
}

async function searchSportmonksExactTeam(name: string): Promise<any | null> {
  if (!sportmonksConfigured()) return null;
  const normalized = normalizeProviderTeamName(name);
  if (!normalized) return null;
  const cached = sportmonksTeamSearchCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.value[0] ?? null;

  const rows = await fetchSportmonksTeamsBySearch(name);
  const exact = rows.find((row: any) => normalizeProviderTeamName(row?.name) === normalized) ?? null;
  if (exact) {
    sportmonksTeamSearchCache.set(normalized, { expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS, value: [exact] });
    return exact;
  }

  // Manual/third-party slates often use a presentation name that differs from
  // Sportmonks' canonical team name. Accept a fuzzy identity only when one
  // candidate is clearly stronger; never guess between multiple plausible teams.
  const scored = rows
    .map((row: any) => ({ row, score: providerTeamNameSimilarity(name, String(row?.name || '')) }))
    .filter((entry: any) => entry.score >= 0.75)
    .sort((a: any, b: any) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  const resolved = best && (!second || best.score - second.score >= 0.15) ? best.row : null;
  sportmonksTeamSearchCache.set(normalized, {
    expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS,
    value: resolved ? [resolved] : [],
  });
  return resolved;
}

async function getSportmonksTeamFixtures(teamId: string, kickoffIso: string): Promise<any[]> {
  const start = providerDateFromKickoff(kickoffIso, -120);
  const end = providerDateFromKickoff(kickoffIso, -1);
  const key = teamId + ':' + start + ':' + end;
  const cached = sportmonksTeamFixturesCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetchSportmonksFixturesBetweenForTeam(start, end, teamId);
  sportmonksTeamFixturesCache.set(key, { expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS, value });
  return value;
}

async function getSportApiTeam(teamId: string): Promise<any> {
  const cached = sportApiTeamCache.get(teamId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetchSportApiAiTeam(teamId);
  sportApiTeamCache.set(teamId, { expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS, value });
  return value;
}

async function getSportApiStandings(leagueId: string): Promise<Map<string, { rank: number; points: number | null; form?: ('W' | 'D' | 'L')[] }>> {
  const cached = sportApiStandingsCache.get(leagueId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = sportApiStandingMap(await fetchSportApiAiStandings(leagueId));
  sportApiStandingsCache.set(leagueId, { expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS, value });
  return value;
}

async function getSportApiFixtureStats(fixtureId: string): Promise<any> {
  const cached = sportApiFixtureStatsCache.get(fixtureId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetchSportApiAiFixtureStats(fixtureId);
  sportApiFixtureStatsCache.set(fixtureId, { expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS, value });
  return value;
}

async function getSportApiH2H(team1Id: string, team2Id: string): Promise<any> {
  const key = [String(team1Id), String(team2Id)].sort().join(':');
  const cached = sportApiH2HCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetchSportApiAiHeadToHead(team1Id, team2Id);
  sportApiH2HCache.set(key, { expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS, value });
  return value;
}

async function getSportmonksStandings(seasonId: string): Promise<Map<string, { rank: number; points: number | null; form?: ('W' | 'D' | 'L')[] }>> {
  const cached = sportmonksStandingsCache.get(seasonId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = sportmonksStandingMap(await fetchSportmonksStandingsBySeason(seasonId));
  sportmonksStandingsCache.set(seasonId, { expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS, value });
  return value;
}

async function getSportmonksH2H(team1Id: string, team2Id: string): Promise<any[]> {
  const key = [String(team1Id), String(team2Id)].sort().join(':');
  const cached = sportmonksH2HCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetchSportmonksHeadToHead(team1Id, team2Id);
  sportmonksH2HCache.set(key, { expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS, value });
  return value;
}

const TARGET_COMPETITION_ALIASES = new Set([
  // South Africa & Africa (Hollywoodbets Primary Core)
  'south african premiership',
  'south african first division',
  'south african mtn 8 cup',
  'south african nedbank cup',
  'premier soccer league',
  'caf champions league',
  'caf confederation cup',
  'africa cup of nations',
  'africa cup of nations qualification',
  'afcon',
  'afcon qualifying',

  // Top 5 European Leagues & UK
  'english premier league',
  'premier league',
  'english championship',
  'championship',
  'english league one',
  'league one',
  'english league two',
  'league two',
  'english fa cup',
  'fa cup',
  'english carabao cup',
  'carabao cup',
  'scottish premiership',
  'scottish championship',
  'spanish la liga',
  'laliga',
  'spanish laliga 2',
  'laliga 2',
  'spanish copa del rey',
  'copa del rey',
  'german bundesliga',
  'bundesliga',
  'german 2 bundesliga',
  '2 bundesliga',
  'german dfb pokal',
  'dfb pokal',
  'italian serie a',
  'serie a',
  'italian serie b',
  'serie b',
  'italian coppa italia',
  'coppa italia',
  'french ligue 1',
  'ligue 1',
  'french ligue 2',
  'ligue 2',
  'french coupe de france',
  'coupe de france',
  'dutch eredivisie',
  'eredivisie',
  'portuguese primeira liga',
  'primeira liga',

  // European Continental (UEFA)
  'uefa champions league',
  'uefa europa league',
  'uefa conference league',
  'uefa nations league',

  // Americas & Global
  'us major league soccer',
  'major league soccer',
  'mls',
  'usa major league soccer',
  'usa mls',
  'concacaf nations league',
  'concacaf nations league a',
  'concacaf nations league b',
  'concacaf nations league c',
  'concacaf champions cup',
  'concacaf champions league',
  'brazilian serie a',
  'brazil serie a',
  'argentinian primera division',
  'argentina primera division',
  'copa libertadores',
  'copa sudamericana',
  'copa america',

  // World Cup & International Qualifiers
  'fifa world cup qualifying - caf',
  'fifa world cup qualifying - uefa',
  'fifa world cup qualifying - concacaf',
  'fifa world cup qualifying - conmebol',
  'fifa world cup qualifying - afc',
  'fifa world cup qualifying',
  'world cup qualification caf',
  'world cup qualification uefa',
  'world cup qualification concacaf',
  'world cup qualification conmebol',
  'world cup qualification afc',
  'world cup qualification',
  'internationals',
  'international friendlies',
  'club friendlies',
]);

function normalizeCompetitionName(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().replace(/[.•]/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

/**
 * Bookmaker feeds frequently prefix the actual competition with a country label
 * (for example, "South Africa • Betway Premiership") or a sponsor label
 * ("DSTV Premiership"). Those labels are presentation metadata, not a different
 * competition. Canonicalize only known South African bookmaker aliases here so
 * strict provider identity checks remain intact for every other competition.
 */
export function canonicalizeProviderCompetitionName(value: unknown): string {
  const normalized = normalizeCompetitionName(value);
  if (!normalized) return '';

  const withoutPrefix = normalized
    .replace(/^(south africa|rsa|south african)\s+(?:[•·|:/-]\s*)?/, '')
    .replace(/^(south africa|rsa|south african)\s+/, '');

  const compact = withoutPrefix
    .replace(/\b(hollywoodbets|betway|dstv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^(psl|premier soccer league|south african premiership|premiership)$/.test(compact)) {
    return 'south african premiership';
  }
  if (/^(nfd|national first division|south african first division|first division)$/.test(compact)) {
    return 'south african first division';
  }
  if (/^(mtn 8|south african mtn 8 cup|mtn8)$/.test(compact)) {
    return 'south african mtn 8 cup';
  }
  if (/^(nedbank cup|south african nedbank cup)$/.test(compact)) {
    return 'south african nedbank cup';
  }
  if (/^(carling knockout|carling knockout cup|south african carling knockout cup)$/.test(compact)) {
    return 'south african carling knockout cup';
  }

  // Provider/bookmaker naming variants for supported international competitions.
  // These are identity mappings only; they never create evidence.
  if (/^(ligapro|liga pro|ecuadorian ligapro|ecuadorian serie b|ecuador liga pro serie b|ligapro serie b|ligapro primera b)$/.test(compact)) {
    return 'ecuador ligapro serie b';
  }
  if (/^(liga i|romanian liga i|romanian superliga|superliga romania|romania liga i)$/.test(compact)) {
    return 'romanian liga i';
  }
  if (/^(stars league|iraq stars league|iraqi stars league|iraq premier league)$/.test(compact)) {
    return 'iraq stars league';
  }

  return normalized;
}

export function areCompetitionsCompatible(
  slateLeague: string | undefined,
  slateCompetition: string | undefined,
  providerLeagueName: string | undefined,
  providerCountry?: string
): boolean {
  const normSlate = canonicalizeProviderCompetitionName(slateCompetition || slateLeague);
  const normProvider = canonicalizeProviderCompetitionName(providerLeagueName);
  if (!normSlate || !normProvider) return false;
  if (normSlate === normProvider) return true;

  // Direct alias containment
  if (TARGET_COMPETITION_ALIASES.has(normSlate) && TARGET_COMPETITION_ALIASES.has(normProvider)) {
    if (normSlate.includes(normProvider) || normProvider.includes(normSlate)) return true;
  }

  // Cross-reference against ALL_LEAGUES_DIRECTORY
  for (const info of Object.values(ALL_LEAGUES_DIRECTORY)) {
    const normEntry = canonicalizeProviderCompetitionName(info.name);
    const slateMatches = normSlate === normEntry || normSlate.includes(normEntry) || normEntry.includes(normSlate);
    const providerMatches = normProvider === normEntry || normProvider.includes(normEntry) || normEntry.includes(normProvider);
    if (slateMatches && providerMatches) return true;
  }

  // Check country prefix / descriptor if present
  if (providerCountry && typeof slateLeague === 'string') {
    const normCountry = normalizeCompetitionName(providerCountry);
    if (normCountry && normalizeCompetitionName(slateLeague).includes(normCountry)) {
      const providerWords = normProvider.split(' ').filter((w) => w.length > 3);
      if (providerWords.some((w) => normSlate.includes(w))) return true;
    }
  }

  return false;
}

export function findUniqueMatchingCandidate(
  fixture: MatchFixture,
  candidates: Array<{ raw: any; mapped: MatchFixture }> | undefined
): { raw: any; mapped: MatchFixture } | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const kickoffMs = Date.parse(fixture.kickoffTime);
  if (!Number.isFinite(kickoffMs)) return null;

  const kickoffYear = new Date(kickoffMs).getUTCFullYear();
  const normFixHome = normalizeProviderTeamName(fixture.homeTeam.name);
  const normFixAway = normalizeProviderTeamName(fixture.awayTeam.name);

  const valid = candidates.filter(({ raw, mapped }) => {
    // 1. Kickoff timestamp compatibility: within 3 hours
    const mappedKickoffMs = Date.parse(mapped.kickoffTime);
    if (!Number.isFinite(mappedKickoffMs)) return false;
    if (Math.abs(kickoffMs - mappedKickoffMs) > 3 * 3600 * 1000) return false;

    const isSportmonks = Boolean(raw?.starting_at || raw?.participants || mapped.id?.startsWith('sportmonks_'));

    let homeId: number, awayId: number;
    let rawHomeName: string, rawAwayName: string;
    let seasonValue: any;

    if (isSportmonks) {
      const homeP = extractSportmonksParticipant(raw, 'home');
      const awayP = extractSportmonksParticipant(raw, 'away');
      homeId = Number(homeP?.id);
      awayId = Number(awayP?.id);
      rawHomeName = homeP?.name;
      rawAwayName = awayP?.name;
      seasonValue = raw?.season_id ?? raw?.season;
    } else {
      homeId = Number(raw.teams?.home?.id ?? raw.home_team?.id ?? raw.home_id ?? raw.homeTeam?.id);
      awayId = Number(raw.teams?.away?.id ?? raw.away_team?.id ?? raw.away_id ?? raw.awayTeam?.id);
      rawHomeName = raw.teams?.home?.name || raw.home_team?.name || raw.homeTeam?.name;
      rawAwayName = raw.teams?.away?.name || raw.away_team?.name || raw.awayTeam?.name;
      seasonValue = raw.league?.season || raw.season || raw.season_id;
    }

    // Require raw provider home and away names and positive integer IDs
    if (!rawHomeName || !rawAwayName || !Number.isInteger(homeId) || homeId <= 0 || !Number.isInteger(awayId) || awayId <= 0) return false;

    // Exact normalized home and away team names
    const normRawHome = normalizeProviderTeamName(rawHomeName);
    const normRawAway = normalizeProviderTeamName(rawAwayName);
    if (normRawHome !== normFixHome || normRawAway !== normFixAway) return false;

    // Season validation: only validate calendar year if seasonValue is a valid 4-digit year (1900-2100)
    const seasonNum = Number(seasonValue);
    if (Number.isInteger(seasonNum) && seasonNum >= 1900 && seasonNum <= 2100 && Number.isFinite(kickoffYear)) {
      if (Math.abs(seasonNum - kickoffYear) > 1) return false;
    }

    // Competition identity & compatibility
    const rawLeagueName = String(raw.league?.name || raw.league_name || raw.league?.data?.name || mapped.competition || mapped.league || '');
    const rawCountry = String(raw.league?.country || '');
    if (!areCompetitionsCompatible(fixture.league, fixture.competition, rawLeagueName, rawCountry)) {
      return false;
    }

    return true;
  });

  if (valid.length === 0) return null;

  // Compare all pairs of valid candidates for conflicts when fixture ID and league ID match
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const a = valid[i];
      const b = valid[j];

      const aIsSM = a.mapped.automationSource === 'SPORTMONKS' || a.mapped.id?.startsWith('sportmonks_') || Boolean(a.raw?.starting_at || a.raw?.participants);
      const bIsSM = b.mapped.automationSource === 'SPORTMONKS' || b.mapped.id?.startsWith('sportmonks_') || Boolean(b.raw?.starting_at || b.raw?.participants);

      const aFixId = String(a.raw.fixture?.id ?? a.raw.id);
      const bFixId = String(b.raw.fixture?.id ?? b.raw.id);
      const aLeagueId = String(a.raw.league?.id ?? a.raw.league_id ?? a.raw.league?.data?.id ?? '');
      const bLeagueId = String(b.raw.league?.id ?? b.raw.league_id ?? b.raw.league?.data?.id ?? '');

      if (aFixId === bFixId && aLeagueId === bLeagueId) {
        const aHomeId = aIsSM
          ? Number(extractSportmonksParticipant(a.raw, 'home')?.id)
          : Number(a.raw.teams?.home?.id ?? a.raw.home_team?.id ?? a.raw.home_id ?? a.raw.homeTeam?.id);
        const bHomeId = bIsSM
          ? Number(extractSportmonksParticipant(b.raw, 'home')?.id)
          : Number(b.raw.teams?.home?.id ?? b.raw.home_team?.id ?? b.raw.home_id ?? b.raw.homeTeam?.id);

        const aAwayId = aIsSM
          ? Number(extractSportmonksParticipant(a.raw, 'away')?.id)
          : Number(a.raw.teams?.away?.id ?? a.raw.away_team?.id ?? a.raw.away_id ?? a.raw.awayTeam?.id);
        const bAwayId = bIsSM
          ? Number(extractSportmonksParticipant(b.raw, 'away')?.id)
          : Number(b.raw.teams?.away?.id ?? b.raw.away_team?.id ?? b.raw.away_id ?? b.raw.awayTeam?.id);

        const aHomeName = normalizeProviderTeamName(a.mapped.homeTeam.name);
        const bHomeName = normalizeProviderTeamName(b.mapped.homeTeam.name);
        const aAwayName = normalizeProviderTeamName(a.mapped.awayTeam.name);
        const bAwayName = normalizeProviderTeamName(b.mapped.awayTeam.name);

        const aKickoff = Date.parse(a.mapped.kickoffTime);
        const bKickoff = Date.parse(b.mapped.kickoffTime);

        const aComp = normalizeCompetitionName(a.mapped.competition || a.mapped.league);
        const bComp = normalizeCompetitionName(b.mapped.competition || b.mapped.league);

        const aSeason = String(a.raw.league?.season || a.raw.season || a.raw.season_id || '');
        const bSeason = String(b.raw.league?.season || b.raw.season || b.raw.season_id || '');

        const conflict = aHomeId !== bHomeId ||
                         aAwayId !== bAwayId ||
                         aHomeName !== bHomeName ||
                         aAwayName !== bAwayName ||
                         aKickoff !== bKickoff ||
                         aComp !== bComp ||
                         aSeason !== bSeason;

        if (conflict) {
          return null; // Conflicting duplicate record -> reject
        }
      }
    }
  }

  let resolved = valid;
  if (valid.length > 1) {
    let minDiff = Infinity;
    for (const cand of valid) {
      const mappedKickoffMs = Date.parse(cand.mapped.kickoffTime);
      const diff = Math.abs(kickoffMs - mappedKickoffMs);
      if (diff < minDiff) {
        minDiff = diff;
      }
    }
    resolved = valid.filter(cand => {
      const mappedKickoffMs = Date.parse(cand.mapped.kickoffTime);
      return Math.abs(kickoffMs - mappedKickoffMs) === minDiff;
    });
  }

  if (resolved.length === 1) return resolved[0];

  // Strong duplicate/ambiguity validation across all identity fields (using extractSportmonksParticipant for SM)
  const ref = resolved[0];
  const refIsSM = ref.mapped.automationSource === 'SPORTMONKS' || ref.mapped.id?.startsWith('sportmonks_') || Boolean(ref.raw?.starting_at || ref.raw?.participants);

  const refFixtureId = String(ref.raw.fixture?.id ?? ref.raw.id);
  const refLeagueId = String(ref.raw.league?.id ?? ref.raw.league_id ?? ref.raw.league?.data?.id ?? '');

  const refHomeId = refIsSM
    ? Number(extractSportmonksParticipant(ref.raw, 'home')?.id)
    : Number(ref.raw.teams?.home?.id ?? ref.raw.home_team?.id ?? ref.raw.home_id ?? ref.raw.homeTeam?.id);
  const refAwayId = refIsSM
    ? Number(extractSportmonksParticipant(ref.raw, 'away')?.id)
    : Number(ref.raw.teams?.away?.id ?? ref.raw.away_team?.id ?? ref.raw.away_id ?? ref.raw.awayTeam?.id);

  const refHomeName = normalizeProviderTeamName(ref.mapped.homeTeam.name);
  const refAwayName = normalizeProviderTeamName(ref.mapped.awayTeam.name);
  const refKickoff = ref.mapped.kickoffTime;
  const refComp = normalizeCompetitionName(ref.mapped.competition || ref.mapped.league);
  const refSeason = String(ref.raw.league?.season || ref.raw.season || ref.raw.season_id || '');

  const allGenuinelyIdentical = resolved.every((v) => {
    const vIsSM = v.mapped.automationSource === 'SPORTMONKS' || v.mapped.id?.startsWith('sportmonks_') || Boolean(v.raw?.starting_at || v.raw?.participants);
    const fixId = String(v.raw.fixture?.id ?? v.raw.id);
    const lId = String(v.raw.league?.id ?? v.raw.league_id ?? v.raw.league?.data?.id ?? '');

    const hId = vIsSM
      ? Number(extractSportmonksParticipant(v.raw, 'home')?.id)
      : Number(v.raw.teams?.home?.id ?? v.raw.home_team?.id ?? v.raw.home_id ?? v.raw.homeTeam?.id);
    const aId = vIsSM
      ? Number(extractSportmonksParticipant(v.raw, 'away')?.id)
      : Number(v.raw.teams?.away?.id ?? v.raw.away_team?.id ?? v.raw.away_id ?? v.raw.awayTeam?.id);

    const hName = normalizeProviderTeamName(v.mapped.homeTeam.name);
    const aName = normalizeProviderTeamName(v.mapped.awayTeam.name);
    const kickoff = v.mapped.kickoffTime;
    const comp = normalizeCompetitionName(v.mapped.competition || v.mapped.league);
    const season = String(v.raw.league?.season || v.raw.season || v.raw.season_id || '');

    return fixId === refFixtureId &&
           lId === refLeagueId &&
           hId === refHomeId &&
           aId === refAwayId &&
           hName === refHomeName &&
           aName === refAwayName &&
           kickoff === refKickoff &&
           comp === refComp &&
           season === refSeason;
  });

  if (allGenuinelyIdentical) return resolved[0];
  return null; // Ambiguous conflicting candidates -> reject
}

function isTargetCompetition(raw: any, mapped: MatchFixture): boolean {
  const leagueName = normalizeCompetitionName(raw?.league?.name || mapped.competition || mapped.league);
  if (TARGET_COMPETITION_ALIASES.has(leagueName)) return true;
  return Object.values(ALL_LEAGUES_DIRECTORY).some((entry) => normalizeCompetitionName(entry.name) === leagueName);
}

function fixtureKey(f: MatchFixture): string {
  const kickoffHour = f.kickoffTime ? f.kickoffTime.slice(0, 13) : '';
  return `${normalizeProviderTeamName(f.homeTeam.name)}|${normalizeProviderTeamName(f.awayTeam.name)}|${kickoffHour}`;
}

function isPrimarySource(source: unknown): boolean {
  return source === 'SPORTAPI_AI' || source === 'SPORTMONKS';
}

function hasVerifiedForm(team: TeamStats): boolean {
  return Boolean(team.formSource) && Array.isArray(team.form) && team.form.length > 0;
}

function hasVerifiedStanding(team: TeamStats): boolean {
  return Boolean(team.standingsSource) && Number.isFinite(team.leagueRank) && team.leagueRank >= 1;
}

function hasVerifiedMatchStats(team: TeamStats): boolean {
  return Boolean(team.matchStatsSource) &&
    (Number.isFinite(team.avgPossession) || Number.isFinite(team.avgShotsOnTarget));
}

function hasVerifiedAdvancedStats(team: TeamStats): boolean {
  return Boolean(team.advancedStatsSource) &&
    (
      Number.isFinite(team.expectedGoalsAvg) ||
      Number.isFinite(team.avgMatchRating) ||
      Number.isFinite(team.totalSquadValueEur)
    );
}

/**
 * Adds multi-provider fixture coverage, then enriches exact provider identities;
 * fixture/team matches with current competition standings and provider form.
 * No missing value is filled with a default or inferred from the opposing team.
 */

export interface FootballProviderEnrichmentOptions {
  enableApiFootball?: boolean;
  enableSportmonks?: boolean;
  enableSportApiAi?: boolean;
}

export async function enrichFixturesWithFootballApis(
  fixtures: MatchFixture[],
  requestedDates: string[] = [],
  options: FootballProviderEnrichmentOptions = {}
): Promise<{
  fixtures: MatchFixture[];
  apiFootballFixtures: number;
  sportmonksFixtures: number;
  apiFootballMappedFixtures: number;
  sportmonksMappedFixtures: number;
  apiFootballSuccessfulRequests: number;
  sportmonksSuccessfulRequests: number;
  apiFootballFailedRequests: number;
  sportmonksFailedRequests: number;
  enrichedTeams: number;
  errors: string[];
}> {
  const errors: string[] = [];
  const apiFootballEnabled = options.enableApiFootball !== false;
  const sportmonksEnabled = options.enableSportmonks !== false;
  const sportApiAiEnabled = options.enableSportApiAi !== false;

  const enriched: MatchFixture[] = fixtures.map(f => ({ ...f }));

  const dates = Array.from(new Set([
    ...requestedDates,
    ...fixtures.map((f) => f.kickoffTime ? f.kickoffTime.slice(0, 10) : '').filter(Boolean),
  ].filter(Boolean)));

  const apiRaw: any[] = [];
  const sportmonksRaw: any[] = [];
  let apiFootballSuccessfulRequests = 0;
  let sportmonksSuccessfulRequests = 0;
  let apiFootballFailedRequests = 0;
  let sportmonksFailedRequests = 0;

  if (apiFootballEnabled && apiFootballConfigured()) {
    for (const date of dates) {
      if (!apiFootballConfigured()) break;
      try {
        apiRaw.push(...await fetchApiFootballFixturesByDate(date));
        apiFootballSuccessfulRequests++;
      } catch (err) {
        if (!apiFootballConfigured()) break;
        apiFootballFailedRequests++;
        errors.push('API-Football ' + date + ': ' + (err instanceof Error ? err.message : String(err)));
      }
    }
  }

  if (sportmonksEnabled && sportmonksConfigured()) {
    for (const date of dates) {
      if (!sportmonksConfigured()) break;
      try {
        sportmonksRaw.push(...await fetchSportmonksFixturesByDate(date));
        sportmonksSuccessfulRequests++;
      } catch (err) {
        if (!sportmonksConfigured()) break;
        sportmonksFailedRequests++;
        errors.push('Sportmonks ' + date + ': ' + (err instanceof Error ? err.message : String(err)));
      }
    }
  }

  const apiFootballCandidates: Array<{ raw: any; mapped: MatchFixture }> = [];
  let apiFootballMappedFixtures = 0;
  for (const raw of apiRaw) {
    const mapped = mapApiFootballFixture(raw);
    if (mapped && isTargetCompetition(raw, mapped)) {
      apiFootballMappedFixtures++;
      apiFootballCandidates.push({ raw, mapped });
    }
  }

  // Add new API-Football fixtures to the slate if they are completely unrepresented
  for (const cand of apiFootballCandidates) {
    // Historical/completed provider fixtures are enrichment evidence only;
    // never add them as new slate fixtures.
    if (Date.parse(cand.mapped.kickoffTime) < Date.now() - 3 * 60 * 60 * 1000) continue;
    const existingMatches = findMatchingSlateFixtures(cand.mapped, enriched);
    if (existingMatches.length === 0) {
      const duplicatedCandidates = apiFootballCandidates.filter(c => {
        return normalizeProviderTeamName(c.mapped.homeTeam.name) === normalizeProviderTeamName(cand.mapped.homeTeam.name) &&
               normalizeProviderTeamName(c.mapped.awayTeam.name) === normalizeProviderTeamName(cand.mapped.awayTeam.name) &&
               Math.abs(Date.parse(c.mapped.kickoffTime) - Date.parse(cand.mapped.kickoffTime)) <= 3 * 3600 * 1000 &&
               areCompetitionsCompatible(c.mapped.league, c.mapped.competition, cand.mapped.competition || cand.mapped.league);
      });
      if (duplicatedCandidates.length === 1) {
        enriched.push(cand.mapped);
      }
    }
  }

  const usedApiFootballFixtureIds = new Set<string>();
  for (const f of enriched) {
    if (f.apiFootballFixtureId) {
      usedApiFootballFixtureIds.add(String(f.apiFootballFixtureId));
    }
  }

  // Enrich existing slate fixtures with API-Football
  for (const f of enriched) {
    if (f.apiFootballFixtureId) continue;

    const compatible = apiFootballCandidates.filter((cand) => {
      const candidateId = String(cand.raw.fixture?.id ?? cand.raw.id);
      if (usedApiFootballFixtureIds.has(candidateId)) return false;

      const fKickMs = Date.parse(f.kickoffTime);
      const rawCandKick = cand.raw?.fixture?.date;
      if (!rawCandKick) return false;
      const cKickMs = Date.parse(rawCandKick);
      if (!Number.isFinite(fKickMs) || !Number.isFinite(cKickMs)) return false;
      if (Math.abs(fKickMs - cKickMs) > 3 * 3600 * 1000) return false;

      const rawHomeName = cand.raw?.teams?.home?.name;
      const rawAwayName = cand.raw?.teams?.away?.name;
      if (!rawHomeName || !rawAwayName) return false;

      const normFixHome = normalizeProviderTeamName(f.homeTeam.name);
      const normFixAway = normalizeProviderTeamName(f.awayTeam.name);
      const normRawHome = normalizeProviderTeamName(rawHomeName);
      const normRawAway = normalizeProviderTeamName(rawAwayName);
      if (normRawHome !== normFixHome || normRawAway !== normFixAway) return false;

      const rawLeagueName = String(cand.raw.league?.name || cand.raw.league_name || cand.mapped.competition || cand.mapped.league || '');
      const rawCountry = String(cand.raw.league?.country || '');
      if (!areCompetitionsCompatible(f.league, f.competition, rawLeagueName, rawCountry)) {
        return false;
      }

      return true;
    });

    const uniqueMatch = findUniqueMatchingCandidate(f, compatible);
    if (uniqueMatch) {
      const raw = uniqueMatch.raw;
      const fixtureId = String(raw.fixture?.id ?? raw.id);
      usedApiFootballFixtureIds.add(fixtureId);

      const leagueId = Number(raw.league?.id);
      const season = Number(raw.league?.season || raw.season || raw.season_id);
      const homeId = Number(raw.teams?.home?.id ?? raw.home_team?.id ?? raw.home_id ?? raw.homeTeam?.id);
      const awayId = Number(raw.teams?.away?.id ?? raw.away_team?.id ?? raw.away_id ?? raw.awayTeam?.id);

      Object.assign(f, {
        apiFootballFixtureId: fixtureId,
        apiFootballLeagueId: leagueId,
        apiFootballSeason: Number.isInteger(season) && season >= 1900 && season <= 2100 ? season : undefined,
        apiFootballHomeTeamId: homeId,
        apiFootballAwayTeamId: awayId,
      });
    }
  }

  const sportmonksCandidates: Array<{ raw: any; mapped: MatchFixture }> = [];
  let sportmonksMappedFixtures = 0;
  for (const raw of sportmonksRaw) {
    const mapped = mapSportmonksFixture(raw);
    if (mapped && isTargetCompetition(raw, mapped)) {
      sportmonksMappedFixtures++;
      sportmonksCandidates.push({ raw, mapped });
    }
  }

  // Add new Sportmonks fixtures to slate if completely unrepresented
  for (const cand of sportmonksCandidates) {
    // Historical/completed provider fixtures are enrichment evidence only;
    // never add them as new slate fixtures.
    if (Date.parse(cand.mapped.kickoffTime) < Date.now() - 3 * 60 * 60 * 1000) continue;
    const existingMatches = findMatchingSlateFixtures(cand.mapped, enriched);
    if (existingMatches.length === 0) {
      const duplicatedCandidates = sportmonksCandidates.filter(c => {
        return normalizeProviderTeamName(c.mapped.homeTeam.name) === normalizeProviderTeamName(cand.mapped.homeTeam.name) &&
               normalizeProviderTeamName(c.mapped.awayTeam.name) === normalizeProviderTeamName(cand.mapped.awayTeam.name) &&
               Math.abs(Date.parse(c.mapped.kickoffTime) - Date.parse(cand.mapped.kickoffTime)) <= 3 * 3600 * 1000 &&
               areCompetitionsCompatible(c.mapped.league, c.mapped.competition, cand.mapped.competition || cand.mapped.league);
      });
      if (duplicatedCandidates.length === 1) {
        enriched.push(cand.mapped);
      }
    }
  }

  const usedSportmonksFixtureIds = new Set<string>();
  for (const f of enriched) {
    if ((f as any).sportmonksFixtureId) {
      usedSportmonksFixtureIds.add(String((f as any).sportmonksFixtureId));
    }
  }

  // Enrich existing slate fixtures with Sportmonks
  for (const f of enriched) {
    if ((f as any).sportmonksFixtureId) continue;

    const compatible = sportmonksCandidates.filter((cand) => {
      const candidateId = String((cand.mapped as any).sportmonksFixtureId);
      if (usedSportmonksFixtureIds.has(candidateId)) return false;

      const fKickMs = Date.parse(f.kickoffTime);
      const rawCandKick = cand.raw?.starting_at;
      if (!rawCandKick) return false;
      const cKickMs = Date.parse(rawCandKick);
      if (!Number.isFinite(fKickMs) || !Number.isFinite(cKickMs)) return false;
      if (Math.abs(fKickMs - cKickMs) > 3 * 3600 * 1000) return false;

      const rawHomeParticipant = extractSportmonksParticipant(cand.raw, 'home');
      const rawAwayParticipant = extractSportmonksParticipant(cand.raw, 'away');
      const rawHomeName = rawHomeParticipant?.name;
      const rawAwayName = rawAwayParticipant?.name;
      if (!rawHomeName || !rawAwayName) return false;

      const normFixHome = normalizeProviderTeamName(f.homeTeam.name);
      const normFixAway = normalizeProviderTeamName(f.awayTeam.name);
      const normRawHome = normalizeProviderTeamName(rawHomeName);
      const normRawAway = normalizeProviderTeamName(rawAwayName);
      if (normRawHome !== normFixHome || normRawAway !== normFixAway) return false;

      const rawLeagueName = String(cand.raw.league?.name || cand.raw.league_name || cand.mapped.competition || cand.mapped.league || '');
      const rawCountry = String(cand.raw.league?.country || '');
      if (!areCompetitionsCompatible(f.league, f.competition, rawLeagueName, rawCountry)) {
        return false;
      }

      return true;
    });

    const uniqueMatch = findUniqueMatchingCandidate(f, compatible);
    if (uniqueMatch) {
      const fixtureId = String((uniqueMatch.mapped as any).sportmonksFixtureId);
      usedSportmonksFixtureIds.add(fixtureId);

      Object.assign(f, {
        sportmonksFixtureId: (uniqueMatch.mapped as any).sportmonksFixtureId,
        sportmonksLeagueId: (uniqueMatch.mapped as any).sportmonksLeagueId,
        sportMonksSeasonId: (uniqueMatch.mapped as any).sportMonksSeasonId,
        sportmonksHomeTeamId: (uniqueMatch.mapped as any).sportmonksHomeTeamId,
        sportmonksAwayTeamId: (uniqueMatch.mapped as any).sportmonksAwayTeamId,
      });
    }
  }

  // Recover missing SportAPI.ai fixture/team IDs by exact home/away/date identity.
  // This lets manually or third-party ingested slates reach the primary provider.
  const sportApiFixtureIdsByKey = new Map<string, any>();
  if (sportApiAiEnabled && sportApiAiConfigured()) {
    for (const date of dates) {
      try {
        const rawFixtures = await fetchSportApiAiFixturesByDate(date);
        for (const raw of rawFixtures) {
          const homeName = raw?.home_team?.name || raw?.homeTeam?.name;
          const awayName = raw?.away_team?.name || raw?.awayTeam?.name;
          if (!homeName || !awayName) continue;
          const rawKickoff = raw?.datetime || raw?.kickoff_time || raw?.utc_date || raw?.date;
          if (typeof rawKickoff !== 'string' || !/[T ]\d{2}:\d{2}/.test(rawKickoff)) continue;
          const parsed = new Date(rawKickoff);
          if (!Number.isFinite(parsed.getTime())) continue;
          const key = normalizeProviderTeamName(homeName) + '|' + normalizeProviderTeamName(awayName) + '|' + parsed.toISOString().slice(0, 10);
          const existingList = sportApiFixtureIdsByKey.get(key) || [];
          existingList.push({
            fixtureId: raw?.id,
            leagueId: raw?.league_id ?? raw?.league?.id,
            homeTeamId: raw?.home_id ?? raw?.home_team?.id ?? raw?.homeTeam?.id,
            awayTeamId: raw?.away_id ?? raw?.away_team?.id ?? raw?.awayTeam?.id,
            kickoffTime: parsed.toISOString(),
            raw,
          });
          sportApiFixtureIdsByKey.set(key, existingList);
        }
      } catch (err) {
        errors.push('SportAPI.ai fixtures ' + date + ': ' + (err instanceof Error ? err.message : String(err)));
      }
    }
  }

  const usedSportApiFixtureIds = new Set<string>();
  for (const fixture of enriched) {
    if (isValidPositiveInteger((fixture as any).sportApiAiFixtureId)) {
      usedSportApiFixtureIds.add(String((fixture as any).sportApiAiFixtureId));
    }
  }

  for (const fixture of enriched) {
    if (isValidPositiveInteger((fixture as any).sportApiAiFixtureId)) continue;

    const kickoffDate = fixture.kickoffTime ? fixture.kickoffTime.slice(0, 10) : '';
    const key = normalizeProviderTeamName(fixture.homeTeam.name) + '|' + normalizeProviderTeamName(fixture.awayTeam.name) + '|' + kickoffDate;
    const candidates = sportApiFixtureIdsByKey.get(key);
    if (!candidates) continue;

    const compatible = candidates.filter((cand: any) => {
      const candidateId = String(cand.fixtureId);
      if (usedSportApiFixtureIds.has(candidateId)) return false;

      const fKickMs = Date.parse(fixture.kickoffTime);
      const rawCandKick = cand.raw?.datetime || cand.raw?.kickoff_time || cand.raw?.utc_date || cand.raw?.date;
      if (!rawCandKick) return false;
      const cKickMs = Date.parse(rawCandKick);
      if (!Number.isFinite(fKickMs) || !Number.isFinite(cKickMs)) return false;
      if (Math.abs(fKickMs - cKickMs) > 3 * 3600 * 1000) return false;

      const rawLeagueName = cand.raw?.league?.name || cand.raw?.league_name || '';
      if (!areCompetitionsCompatible(fixture.league, fixture.competition, rawLeagueName)) {
        return false;
      }
      return true;
    });

    if (compatible.length >= 1) {
      const firstCand = compatible[0];
      const isAllSame = compatible.every(c => {
        return String(c.fixtureId) === String(firstCand.fixtureId) &&
               String(c.leagueId) === String(firstCand.leagueId) &&
               String(c.homeTeamId) === String(firstCand.homeTeamId) &&
               String(c.awayTeamId) === String(firstCand.awayTeamId);
      });

      if (isAllSame) {
        const ids = firstCand;
        const fixtureId = String(ids.fixtureId);
        usedSportApiFixtureIds.add(fixtureId);

        const currentFixtureId = (fixture as any).sportApiAiFixtureId;
        if (isValidPositiveInteger(ids.fixtureId)) {
          if (!isValidPositiveInteger(currentFixtureId)) {
            (fixture as any).sportApiAiFixtureId = String(ids.fixtureId);
          }
        }

        const currentLeagueId = (fixture as any).sportApiAiLeagueId;
        if (isValidPositiveInteger(ids.leagueId)) {
          if (!isValidPositiveInteger(currentLeagueId)) {
            (fixture as any).sportApiAiLeagueId = Number(ids.leagueId);
          }
        }

        const currentHomeId = (fixture as any).sportApiAiHomeTeamId;
        if (isValidPositiveInteger(ids.homeTeamId)) {
          if (!isValidPositiveInteger(currentHomeId)) {
            (fixture as any).sportApiAiHomeTeamId = Number(ids.homeTeamId);
          }
        }

        const currentAwayId = (fixture as any).sportApiAiAwayTeamId;
        if (isValidPositiveInteger(ids.awayTeamId)) {
          if (!isValidPositiveInteger(currentAwayId)) {
            (fixture as any).sportApiAiAwayTeamId = Number(ids.awayTeamId);
          }
        }
      }
    }
  }

  const sportApiTeamBudget = { used: 0 };
  const sportApiStatBudget = { used: 0 };
  const sportApiH2HBudget = { used: 0 };
  const sportmonksTeamBudget = { used: 0 };
  const sportmonksH2HBudget = { used: 0 };
  const sportmonksTeamSearchBudget = { used: 0 };

  async function enrichFromSportApi(fixture: MatchFixture): Promise<void> {
    if (!sportApiAiEnabled || !sportApiAiConfigured()) return;
    const rawHomeId = (fixture as any).sportApiAiHomeTeamId;
    const rawAwayId = (fixture as any).sportApiAiAwayTeamId;
    const rawLeagueId = (fixture as any).sportApiAiLeagueId;

    if (!isValidPositiveInteger(rawHomeId) || !isValidPositiveInteger(rawAwayId)) return;

    const homeId = Number(rawHomeId);
    const awayId = Number(rawAwayId);

    if (isValidPositiveInteger(rawLeagueId)) {
      const leagueId = Number(rawLeagueId);
      try {
        const standings = await getSportApiStandings(String(leagueId));
        for (const entry of [[fixture.homeTeam, homeId], [fixture.awayTeam, awayId]] as const) {
          const team = entry[0];
          const id = entry[1];
          const standing = findProviderStanding(standings, String(id), team.name);
          if (standing) {
            // SportAPI.ai is the highest-priority primary evidence source.
            // Replace stale/secondary provenance, but never replace an existing
            // SportAPI.ai value with weaker data later in the pipeline.
            if (standing) {
              team.leagueRank = standing.rank;
              team.points = standing.points;
              team.standingsSource = 'SPORTAPI_AI';
            }
            if (standing.form?.length) {
              team.form = standing.form.slice(-5);
              team.formSource = 'SPORTAPI_AI';
            }
          }
        }
      } catch (err) {
        errors.push('SportAPI.ai standings ' + leagueId + ': ' + (err instanceof Error ? err.message : String(err)));
      }
    }

    // SportAPI.ai enrichment must use SportAPI.ai team IDs. The two providers
    // have independent entity namespaces and their IDs must never be mixed.
    const sportApiEntries: Array<[TeamStats, number]> = [
      [fixture.homeTeam, homeId],
      [fixture.awayTeam, awayId],
    ];

    for (const entry of sportApiEntries) {
      const team = entry[0];
      const id = entry[1];
      if (sportApiTeamBudget.used >= providerLimit('SPORT_PROVIDER_MAX_TEAM_LOOKUPS', DEFAULT_TEAM_LOOKUP_LIMIT)) break;
      sportApiTeamBudget.used++;
      try {
        const body = await getSportApiTeam(String(id));
        const matches = extractSportApiTeamMatches(body);
        const formPatch = summarizeFormFromMatches(team.name, String(id), matches, fixture.kickoffTime, 'SPORTAPI_AI', fixture.league, fixture.competition);
        if (formPatch.form?.length && !isPrimarySource(team.formSource)) Object.assign(team, formPatch);
        team.scheduleSource = 'SPORTAPI_AI';

        if (!team.homeAwayFormSource) {
          const homeMatches = matches.filter((m) => completedProviderMatch(m, fixture.kickoffTime) && teamSideForFixture(m, String(id), team.name) === 'home');
          const awayMatches = matches.filter((m) => completedProviderMatch(m, fixture.kickoffTime) && teamSideForFixture(m, String(id), team.name) === 'away');
          if (homeMatches.length >= 3) {
            const homeForm = summarizeFormFromMatches(team.name, String(id), homeMatches.slice(-5), fixture.kickoffTime, 'SPORTAPI_AI', fixture.league, fixture.competition).form || [];
            const ppg = homeForm.length ? homeForm.reduce((sum, r) => sum + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0) / homeForm.length : 0;
            team.isHomeDominant = ppg >= 2.0;
            team.homeAwayFormSource = 'SPORTAPI_AI';
          }
          if (awayMatches.length >= 3) {
            const awayForm = summarizeFormFromMatches(team.name, String(id), awayMatches.slice(-5), fixture.kickoffTime, 'SPORTAPI_AI', fixture.league, fixture.competition).form || [];
            const ppg = awayForm.length ? awayForm.reduce((sum, r) => sum + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0) / awayForm.length : 0;
            team.hasTopTierAwayForm = ppg >= 2.0;
            team.homeAwayFormSource = 'SPORTAPI_AI';
          }
        }

        const recent = eligibleHistoricalMatches(matches, fixture, fixture.kickoffTime)
          .sort((a, b) => Date.parse(String(a.datetime || a.utc_date || a.starting_at || a.date || '')) -
            Date.parse(String(b.datetime || b.utc_date || b.starting_at || b.date || '')))
          .slice(-5);

        const possessionValues: number[] = [];
        const shotsValues: number[] = [];
        for (const match of recent) {
          const fixtureId = match?.id ?? match?.fixture_id;
          if (!isValidPositiveInteger(fixtureId)) continue;
          if (sportApiStatBudget.used >= providerLimit('SPORT_PROVIDER_MAX_MATCH_STAT_LOOKUPS', DEFAULT_MATCH_STAT_LOOKUP_LIMIT)) break;
          sportApiStatBudget.used++;
          try {
            const stats = await getSportApiFixtureStats(String(fixtureId));
            const side = teamSideForFixture(match, String(id), team.name);
            const block = side === 'home' ? (stats?.data?.home ?? stats?.home)
              : side === 'away' ? (stats?.data?.away ?? stats?.away) : null;
            if (!block) continue;
            const possession = finiteNumber(block.possession ?? block.ball_possession ?? block.possession_pct);
            const shots = finiteNumber(block.shots_on_target ?? block.shotsOnTarget);
            if (possession !== null && possession >= 0 && possession <= 100) possessionValues.push(possession);
            if (shots !== null && shots >= 0 && shots <= 20) shotsValues.push(shots);
          } catch (err) {
            errors.push('SportAPI.ai match stats ' + fixtureId + ': ' + (err instanceof Error ? err.message : String(err)));
          }
        }

        if (possessionValues.length >= 3 && (!isPrimarySource(team.matchStatsSource) || team.matchStatsSource === 'SPORTAPI_AI')) {
          team.avgPossession = Math.round((possessionValues.reduce((a, b) => a + b, 0) / possessionValues.length) * 10) / 10;
          team.matchStatsSource = 'SPORTAPI_AI';
        }
        if (shotsValues.length >= 3 && (!isPrimarySource(team.matchStatsSource) || team.matchStatsSource === 'SPORTAPI_AI')) {
          team.avgShotsOnTarget = Math.round((shotsValues.reduce((a, b) => a + b, 0) / shotsValues.length) * 10) / 10;
          team.matchStatsSource = 'SPORTAPI_AI';
        }
      } catch (err) {
        errors.push('SportAPI.ai team ' + id + ' (' + team.name + '): ' + (err instanceof Error ? err.message : String(err)));
      }
    }

    if ((!fixture.h2h?.source || !isPrimarySource(fixture.h2h.source)) && sportApiH2HBudget.used < providerLimit('SPORT_PROVIDER_MAX_H2H_LOOKUPS', DEFAULT_H2H_LOOKUP_LIMIT)) {
      sportApiH2HBudget.used++;
      try {
        const body = await getSportApiH2H(String(homeId), String(awayId));
        const h2h = buildH2HFromProviderFixtures(
          String(homeId), String(awayId), fixture.homeTeam.name, fixture.awayTeam.name,
          extractProviderH2HFixtures(body), fixture.kickoffTime, 'SPORTAPI_AI'
        );
        if (h2h) fixture.h2h = h2h;
      } catch (err) {
        errors.push('SportAPI.ai H2H ' + fixture.homeTeam.name + ' / ' + fixture.awayTeam.name + ': ' + (err instanceof Error ? err.message : String(err)));
      }
    }
  }

  async function enrichFromSportmonks(fixture: MatchFixture): Promise<void> {
    if (!sportmonksEnabled || !sportmonksConfigured()) return;
    let homeId = Number((fixture as any).sportmonksHomeTeamId);
    let awayId = Number((fixture as any).sportmonksAwayTeamId);
    const seasonId = Number((fixture as any).sportMonksSeasonId);

    // The current-date fixture feed may be empty under a restricted plan. Recover
    // team IDs by exact provider-name lookup so historical evidence can still be used.
    for (const [team, side] of [[fixture.homeTeam, 'home'], [fixture.awayTeam, 'away']] as const) {
      const existingId = side === 'home' ? homeId : awayId;
      if (Number.isInteger(existingId) || sportmonksTeamSearchBudget.used >= providerLimit('SPORT_PROVIDER_MAX_TEAM_SEARCH_LOOKUPS', 50)) continue;
      if (!sportmonksConfigured()) break;
      sportmonksTeamSearchBudget.used++;
      try {
        const resolved = await searchSportmonksExactTeam(team.name);
        const resolvedId = Number(resolved?.id);
        if (Number.isInteger(resolvedId)) {
          if (side === 'home') {
            homeId = resolvedId;
            (fixture as any).sportmonksHomeTeamId = resolvedId;
          } else {
            awayId = resolvedId;
            (fixture as any).sportmonksAwayTeamId = resolvedId;
          }
        }
      } catch (err) {
        if (!sportmonksConfigured()) break;
        errors.push('Sportmonks team search ' + team.name + ': ' + (err instanceof Error ? err.message : String(err)));
      }
    }

    const resolvedEntries: Array<[TeamStats, number]> = [];
    if (Number.isInteger(homeId)) resolvedEntries.push([fixture.homeTeam, homeId]);
    if (Number.isInteger(awayId)) resolvedEntries.push([fixture.awayTeam, awayId]);
    if (resolvedEntries.length === 0) return;

    for (const entry of resolvedEntries) {
      const team = entry[0];
      const id = entry[1];
      if (sportmonksTeamBudget.used >= providerLimit('SPORT_PROVIDER_MAX_TEAM_LOOKUPS', DEFAULT_TEAM_LOOKUP_LIMIT)) break;
      sportmonksTeamBudget.used++;
      try {
        const matches = await getSportmonksTeamFixtures(String(id), fixture.kickoffTime);
        const formPatch = summarizeFormFromMatches(team.name, String(id), matches, fixture.kickoffTime, 'SPORTMONKS', fixture.league, fixture.competition);
        if (!(team.formSource && team.form.length) && formPatch.form?.length) Object.assign(team, formPatch);
        team.scheduleSource = 'SPORTMONKS';

        const finished = matches
          .filter((m) => completedProviderMatch(m, fixture.kickoffTime))
          .sort((a, b) => Date.parse(String(a.starting_at || a.utc_date || a.date || '')) -
            Date.parse(String(b.starting_at || b.utc_date || b.date || '')))
          .slice(-5);

        const possessionValues: number[] = [];
        const shotsValues: number[] = [];
        const xgValues: number[] = [];
        for (const match of finished) {
          const possession = extractSportmonksStatForTeam(match, String(id), ['BALL_POSSESSION'], [45]);
          const shots = extractSportmonksStatForTeam(match, String(id), ['SHOTS_ON_TARGET'], [86]);
          const xg = sportmonksXGForTeam(match, String(id));
          if (possession !== null && possession >= 0 && possession <= 100) possessionValues.push(possession);
          if (shots !== null && shots >= 0 && shots <= 20) shotsValues.push(shots);
          if (xg !== null && xg >= 0 && xg <= 10) xgValues.push(xg);
        }

        if (possessionValues.length >= 3 && (!isPrimarySource(team.matchStatsSource) || team.matchStatsSource === 'SPORTMONKS')) {
          team.avgPossession = Math.round((possessionValues.reduce((a, b) => a + b, 0) / possessionValues.length) * 10) / 10;
          team.matchStatsSource = 'SPORTMONKS';
        }
        if (shotsValues.length >= 3 && (!isPrimarySource(team.matchStatsSource) || team.matchStatsSource === 'SPORTMONKS')) {
          team.avgShotsOnTarget = Math.round((shotsValues.reduce((a, b) => a + b, 0) / shotsValues.length) * 10) / 10;
          team.matchStatsSource = 'SPORTMONKS';
        }
        if (xgValues.length >= 3 && !isPrimarySource(team.advancedStatsSource)) {
          team.expectedGoalsAvg = Math.round((xgValues.reduce((a, b) => a + b, 0) / xgValues.length) * 100) / 100;
          team.advancedStatsSource = 'SPORTMONKS';
        }

        if (!team.homeAwayFormSource) {
          const homeMatches = eligibleHistoricalMatches(matches, fixture, fixture.kickoffTime).filter((m) => teamSideForFixture(m, String(id), team.name) === 'home').slice(-5);
          const awayMatches = eligibleHistoricalMatches(matches, fixture, fixture.kickoffTime).filter((m) => teamSideForFixture(m, String(id), team.name) === 'away').slice(-5);
          if (homeMatches.length >= 3) {
            const homeForm = summarizeFormFromMatches(team.name, String(id), homeMatches, fixture.kickoffTime, 'SPORTMONKS', fixture.league, fixture.competition).form || [];
            const ppg = homeForm.length ? homeForm.reduce((sum, r) => sum + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0) / homeForm.length : 0;
            team.isHomeDominant = ppg >= 2.0;
            team.homeAwayFormSource = 'SPORTMONKS';
          }
          if (awayMatches.length >= 3) {
            const awayForm = summarizeFormFromMatches(team.name, String(id), awayMatches, fixture.kickoffTime, 'SPORTMONKS', fixture.league, fixture.competition).form || [];
            const ppg = awayForm.length ? awayForm.reduce((sum, r) => sum + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0) / awayForm.length : 0;
            team.hasTopTierAwayForm = ppg >= 2.0;
            team.homeAwayFormSource = 'SPORTMONKS';
          }
        }

        const timestamps = finished.map((m) => Date.parse(String(m.starting_at || m.utc_date || m.date || ''))).filter(Number.isFinite);
        const lastPlayedAt = timestamps.length ? Math.max(...timestamps) : NaN;
        team.hasMidweekFatigue72h = Number.isFinite(lastPlayedAt)
          ? Date.parse(fixture.kickoffTime) - lastPlayedAt <= 72 * 60 * 60 * 1000
          : false;
      } catch (err) {
        errors.push('Sportmonks team ' + id + ' (' + team.name + '): ' + (err instanceof Error ? err.message : String(err)));
      }
    }

    if (Number.isInteger(seasonId)) {
      try {
        const standings = await getSportmonksStandings(String(seasonId));
        for (const entry of resolvedEntries) {
          const team = entry[0];
          const id = entry[1];
          const standing = findProviderStanding(standings, String(id), team.name);
          if (standing) {
            // Sportmonks is a co-primary source. It may fill a missing field,
            // but SportAPI.ai remains authoritative when it already supplied it.
            if (!isPrimarySource(team.standingsSource)) {
              team.leagueRank = standing.rank;
              team.points = standing.points;
              team.standingsSource = 'SPORTMONKS';
            }
            if (standing.form?.length && !isPrimarySource(team.formSource)) {
              team.form = standing.form.slice(-5);
              team.formSource = 'SPORTMONKS';
            }
          }
        }
      } catch (err) {
        errors.push('Sportmonks standings ' + seasonId + ': ' + (err instanceof Error ? err.message : String(err)));
      }
    }

    if (isValidPositiveInteger(homeId) && isValidPositiveInteger(awayId) && (!fixture.h2h?.source || fixture.h2h.source === 'API_FOOTBALL' || fixture.h2h.source === 'FOOTBALL_DATA_ORG') && sportmonksH2HBudget.used < providerLimit('SPORT_PROVIDER_MAX_H2H_LOOKUPS', DEFAULT_H2H_LOOKUP_LIMIT)) {
      sportmonksH2HBudget.used++;
      try {
        const raw = await getSportmonksH2H(String(homeId), String(awayId));
        const h2h = buildH2HFromProviderFixtures(
          String(homeId), String(awayId), fixture.homeTeam.name, fixture.awayTeam.name,
          raw, fixture.kickoffTime, 'SPORTMONKS'
        );
        if (h2h) fixture.h2h = h2h;
      } catch (err) {
        errors.push('Sportmonks H2H ' + fixture.homeTeam.name + ' / ' + fixture.awayTeam.name + ': ' + (err instanceof Error ? err.message : String(err)));
      }
    }
  }

  for (const fixture of enriched) {
    if (sportApiAiEnabled) await enrichFromSportApi(fixture);
    if (sportmonksEnabled) await enrichFromSportmonks(fixture);

    let leagueId = Number(fixture.apiFootballLeagueId);
    let season = Number(fixture.apiFootballSeason);
    let homeId = Number(fixture.apiFootballHomeTeamId);
    let awayId = Number(fixture.apiFootballAwayTeamId);

    // API-Football is fallback-only and never displaces verified SportAPI.ai or Sportmonks evidence.
    if (!fixture.apiFootballFixtureId && apiFootballEnabled && apiFootballConfigured()) {
      const compatible = apiFootballCandidates.filter((cand) => {
        const candidateId = String(cand.raw.fixture?.id ?? cand.raw.id);
        if (usedApiFootballFixtureIds.has(candidateId)) return false;

        const fKickMs = Date.parse(fixture.kickoffTime);
        const rawCandKick = cand.raw?.fixture?.date;
        if (!rawCandKick) return false;
        const cKickMs = Date.parse(rawCandKick);
        if (!Number.isFinite(fKickMs) || !Number.isFinite(cKickMs)) return false;
        if (Math.abs(fKickMs - cKickMs) > 3 * 3600 * 1000) return false;

        const rawHomeName = cand.raw?.teams?.home?.name;
        const rawAwayName = cand.raw?.teams?.away?.name;
        if (!rawHomeName || !rawAwayName) return false;

        const normFixHome = normalizeProviderTeamName(fixture.homeTeam.name);
        const normFixAway = normalizeProviderTeamName(fixture.awayTeam.name);
        const normRawHome = normalizeProviderTeamName(rawHomeName);
        const normRawAway = normalizeProviderTeamName(rawAwayName);
        if (normRawHome !== normFixHome || normRawAway !== normFixAway) return false;

        const rawLeagueName = String(cand.raw.league?.name || cand.raw.league_name || cand.mapped.competition || cand.mapped.league || '');
        const rawCountry = String(cand.raw.league?.country || '');
        if (!areCompetitionsCompatible(fixture.league, fixture.competition, rawLeagueName, rawCountry)) {
          return false;
        }

        return true;
      });

      const match = findUniqueMatchingCandidate(fixture, compatible);
      if (match) {
        const raw = match.raw;
        const fixtureId = String(raw.fixture.id);
        usedApiFootballFixtureIds.add(fixtureId);

        leagueId = Number(raw.league?.id);
        season = Number(raw.league?.season);
        homeId = Number(raw.teams?.home?.id);
        awayId = Number(raw.teams?.away?.id);

        Object.assign(fixture, {
          apiFootballFixtureId: fixtureId,
          apiFootballLeagueId: leagueId,
          apiFootballSeason: season,
          apiFootballHomeTeamId: homeId,
          apiFootballAwayTeamId: awayId,
        });
      }
    }

    if (!fixture.apiFootballFixtureId) continue;
    if (!Number.isInteger(leagueId) || !Number.isInteger(season) || !Number.isInteger(homeId) || !Number.isInteger(awayId)) continue;

    const competitionText = String(fixture.league || '');
    const needHomeForm = !hasVerifiedForm(fixture.homeTeam);
    const needAwayForm = !hasVerifiedForm(fixture.awayTeam);
    const needHomeStanding = !hasVerifiedStanding(fixture.homeTeam);
    const needAwayStanding = !hasVerifiedStanding(fixture.awayTeam);

    if (needHomeForm || needAwayForm || needHomeStanding || needAwayStanding) {
      try {
        const standings = await getApiFootballStandings(leagueId, season);
        const [homeStatsResult, awayStatsResult] = await Promise.allSettled([
          needHomeForm ? getApiFootballTeamStats(homeId, leagueId, season) : Promise.resolve(null),
          needAwayForm ? getApiFootballTeamStats(awayId, leagueId, season) : Promise.resolve(null),
        ]);
        const homeRank = standings.get(String(homeId));
        const awayRank = standings.get(String(awayId));
        if (needHomeForm && homeStatsResult.status === 'fulfilled') Object.assign(fixture.homeTeam, teamStatsFromApiFootball(homeStatsResult.value, needHomeStanding ? homeRank : undefined));
        else if (needHomeStanding && homeRank) Object.assign(fixture.homeTeam, teamStatsFromApiFootball(null, homeRank));
        if (needAwayForm && awayStatsResult.status === 'fulfilled') Object.assign(fixture.awayTeam, teamStatsFromApiFootball(awayStatsResult.value, needAwayStanding ? awayRank : undefined));
        else if (needAwayStanding && awayRank) Object.assign(fixture.awayTeam, teamStatsFromApiFootball(null, awayRank));
      } catch (err) {
        errors.push('API-Football fallback ' + leagueId + '/' + season + ': ' + (err instanceof Error ? err.message : String(err)));
      }
    }

    if (!fixture.h2h?.source || !isPrimarySource(fixture.h2h.source)) {
      try {
        const rawH2H = await fetchApiFootballHeadToHead(homeId, awayId);
        const parsed = buildH2HFromProviderFixtures(
          String(homeId), String(awayId), fixture.homeTeam.name, fixture.awayTeam.name,
          rawH2H, fixture.kickoffTime, 'API_FOOTBALL'
        );
        if (parsed && !fixture.h2h?.source) fixture.h2h = parsed;
      } catch (err) {
        errors.push('API-Football H2H ' + fixture.homeTeam.name + ' / ' + fixture.awayTeam.name + ': ' + (err instanceof Error ? err.message : String(err)));
      }
    }
  }

  const enrichedTeams = enriched.filter((f) =>
    (Array.isArray(f.homeTeam.form) && f.homeTeam.form.length > 0) ||
    (Array.isArray(f.awayTeam.form) && f.awayTeam.form.length > 0) ||
    Number.isFinite(f.homeTeam.leagueRank) ||
    Number.isFinite(f.awayTeam.leagueRank) ||
    Boolean(f.h2h?.source) ||
    Boolean(f.homeTeam.matchStatsSource || f.awayTeam.matchStatsSource) ||
    Boolean(f.homeTeam.advancedStatsSource || f.awayTeam.advancedStatsSource)
  ).length;

  return {
    fixtures: enriched,
    apiFootballFixtures: apiRaw.length,
    sportmonksFixtures: sportmonksRaw.length,
    apiFootballMappedFixtures,
    sportmonksMappedFixtures,
    apiFootballSuccessfulRequests,
    sportmonksSuccessfulRequests,
    apiFootballFailedRequests,
    sportmonksFailedRequests,
    enrichedTeams,
    errors,
  };
}
import type { MatchFixture, TeamStats, H2HRecord } from '../types/soccer';
import {
  apiFootballConfigured,
  sportmonksConfigured,
  apiFootballGet,
  fetchApiFootballFixturesByDate,
  fetchApiFootballHeadToHead,
  fetchSportmonksFixturesByDate,
} from './serverFootballApis';

const TEAM_STATS_TTL_MS = 60 * 60 * 1000;
const teamStatsCache = new Map<string, { expiresAt: number; value: any }>();
const standingsCache = new Map<string, { expiresAt: number; value: Map<string, { rank: number; points: number | null }> }>();

export function normalizeProviderTeamName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|cf|sc|afc|club)\b/g, '').replace(/[^a-z0-9]/g, '');
}

function teamStatsFromApiFootball(
  source: any,
  rank?: { rank: number; points: number | null }
): Partial<TeamStats> {
  const rawForm = typeof source?.form === 'string' ? source.form.toUpperCase() : '';
  const form = rawForm.split('').filter((v: string) => v === 'W' || v === 'D' || v === 'L').slice(-5) as ('W'|'D'|'L')[];
  return {
    ...(rank ? { leagueRank: rank.rank, points: rank.points } : {}),
    ...(form.length ? { form } : {}),
  };
}

function parseApiFootballStandings(body: any): Map<string, { rank: number; points: number | null }> {
  const out = new Map<string, { rank: number; points: number | null }>();
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

function mapApiFootballFixture(raw: any): MatchFixture | null {
  const fixture = raw?.fixture;
  const home = raw?.teams?.home;
  const away = raw?.teams?.away;
  const league = raw?.league;
  const kickoffTime = typeof fixture?.date === 'string' ? new Date(fixture.date) : null;
  if (!fixture?.id || !home?.id || !away?.id || !home?.name || !away?.name ||
      !kickoffTime || !Number.isFinite(kickoffTime.getTime()) || !league?.name) return null;
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
  const participants = Array.isArray(raw?.participants?.data) ? raw.participants.data :
    Array.isArray(raw?.participants) ? raw.participants : [];
  const home = participants.find((p: any) => p?.meta?.location === 'home' || p?.pivot?.location === 'home');
  const away = participants.find((p: any) => p?.meta?.location === 'away' || p?.pivot?.location === 'away');
  const kickoffTime = typeof raw?.starting_at === 'string' ? new Date(raw.starting_at) : null;
  const leagueName = raw?.league?.data?.name || raw?.league?.name;
  if (!fixtureId || !home?.name || !away?.name || !kickoffTime ||
      !Number.isFinite(kickoffTime.getTime()) || typeof leagueName !== 'string') return null;
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
    sportmonksHomeTeamId: Number(home.id) || undefined,
    sportmonksAwayTeamId: Number(away.id) || undefined,
  } as MatchFixture;
}

function fixtureKey(f: MatchFixture): string {
  return `${normalizeProviderTeamName(f.homeTeam.name)}|${normalizeProviderTeamName(f.awayTeam.name)}|${f.kickoffTime.slice(0, 10)}`;
}

/**
 * Adds API-Football and Sportmonks fixture coverage, then enriches exact API-Football
 * fixture/team matches with current competition standings and provider form.
 * No missing value is filled with a default or inferred from the opposing team.
 */
export async function enrichFixturesWithFootballApis(fixtures: MatchFixture[], requestedDates: string[] = []): Promise<{
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
  const byKey = new Map<string, MatchFixture>();
  for (const fixture of fixtures) byKey.set(fixtureKey(fixture), fixture);
  const dates = Array.from(new Set([...requestedDates, ...fixtures.map((f) => f.kickoffTime.slice(0, 10))].filter(Boolean)));

  const apiRaw: any[] = [];
  const sportmonksRaw: any[] = [];
  let apiFootballSuccessfulRequests = 0;
  let sportmonksSuccessfulRequests = 0;
  let apiFootballFailedRequests = 0;
  let sportmonksFailedRequests = 0;
  if (apiFootballConfigured()) {
    for (const date of dates) {
      try { apiRaw.push(...await fetchApiFootballFixturesByDate(date)); apiFootballSuccessfulRequests++; }
      catch (err) { apiFootballFailedRequests++; errors.push(`API-Football ${date}: ${err instanceof Error ? err.message : String(err)}`); }
    }
  }
  if (sportmonksConfigured()) {
    for (const date of dates) {
      try { sportmonksRaw.push(...await fetchSportmonksFixturesByDate(date)); sportmonksSuccessfulRequests++; }
      catch (err) { sportmonksFailedRequests++; errors.push(`Sportmonks ${date}: ${err instanceof Error ? err.message : String(err)}`); }
    }
  }

  // Preserve the original provider's fixture record; attach matching API IDs to it.
  const apiByKey = new Map<string, any>();
  let apiFootballMappedFixtures = 0;
  for (const raw of apiRaw) {
    const mapped = mapApiFootballFixture(raw);
    if (mapped) { apiFootballMappedFixtures++; apiByKey.set(fixtureKey(mapped), { raw, mapped }); }
  }
  const enriched: MatchFixture[] = Array.from(byKey.values());
  const enrichedKeys = new Set(enriched.map(fixtureKey));
  // Add API-Football-only fixtures before enrichment so they receive the same
  // verified standings/form processing as fixtures from the other feeds.
  for (const [key, match] of apiByKey) {
    if (!enrichedKeys.has(key)) {
      enriched.push(match.mapped);
      enrichedKeys.add(key);
    }
  }

  for (const fixture of enriched) {
    const match = apiByKey.get(fixtureKey(fixture));
    if (!match) continue;
    const raw = match.raw;
    const apiFixture = match.mapped;
    const leagueId = Number(raw.league?.id);
    const season = Number(raw.league?.season);
    const homeId = Number(raw.teams?.home?.id);
    const awayId = Number(raw.teams?.away?.id);
    const update: any = {
      apiFootballFixtureId: String(raw.fixture.id),
      apiFootballLeagueId: leagueId,
      apiFootballSeason: season,
      apiFootballHomeTeamId: homeId,
      apiFootballAwayTeamId: awayId,
    };
    if (apiFixture.venue && fixture.venue === 'Unknown Venue') update.venue = apiFixture.venue;

    const competitionText = `${raw.league?.name || ''} ${raw.league?.country || ''} ${fixture.league || ''}`;
    const isPriorityCompetition = /south africa.*premier|premier.*south africa|premier soccer league|premier league|la liga|serie a|bundesliga|ligue 1|champions league|world cup|afcon|nations league|copa america|euro/i.test(competitionText);
    if (isPriorityCompetition && Number.isInteger(leagueId) && Number.isInteger(season) && Number.isInteger(homeId) && Number.isInteger(awayId)) {
      let standings = new Map<string, { rank: number; points: number | null }>();
      try {
        standings = await getApiFootballStandings(leagueId, season);
      } catch (err) {
        errors.push(`API-Football standings ${leagueId}/${season}: ${err instanceof Error ? err.message : String(err)}`);
      }
      const [homeStatsResult, awayStatsResult] = await Promise.allSettled([
        getApiFootballTeamStats(homeId, leagueId, season),
        getApiFootballTeamStats(awayId, leagueId, season),
      ]);
      const homeRank = standings.get(String(homeId));
      const awayRank = standings.get(String(awayId));
      if (homeStatsResult.status === 'fulfilled') {
        update.homeTeam = { ...fixture.homeTeam, ...teamStatsFromApiFootball(homeStatsResult.value, homeRank) };
      } else {
        errors.push(`API-Football team stats ${fixture.homeTeam.name}: ${String(homeStatsResult.reason)}`);
        if (homeRank) update.homeTeam = { ...fixture.homeTeam, ...teamStatsFromApiFootball(null, homeRank) };
      }
      if (awayStatsResult.status === 'fulfilled') {
        update.awayTeam = { ...fixture.awayTeam, ...teamStatsFromApiFootball(awayStatsResult.value, awayRank) };
      } else {
        errors.push(`API-Football team stats ${fixture.awayTeam.name}: ${String(awayStatsResult.reason)}`);
        if (awayRank) update.awayTeam = { ...fixture.awayTeam, ...teamStatsFromApiFootball(null, awayRank) };
      }

      // South African Premiership is not covered by Football-Data.org.
      // Use API-Football's actual direct-match records rather than placeholder zeroes.
      if (!fixture.h2h && /south africa.*premier|premier.*south africa|premier soccer league|south african premiership|betway premiership/i.test(competitionText)) {
        try {
          const rawH2H = await fetchApiFootballHeadToHead(homeId, awayId);
          let homeWins = 0;
          let draws = 0;
          let awayWins = 0;
          const scoresLast5: string[] = [];
          for (const record of rawH2H) {
            const homeGoals = Number(record?.goals?.home);
            const awayGoals = Number(record?.goals?.away);
            if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals)) continue;
            const playedAt = new Date(record?.fixture?.date || '').getTime();
            if (Number.isFinite(playedAt) && playedAt >= new Date(fixture.kickoffTime).getTime()) continue;
            const recordHomeId = Number(record?.teams?.home?.id);
            const recordAwayId = Number(record?.teams?.away?.id);
            const currentHomeAtVenue = recordHomeId === homeId;
            const samePair = (recordHomeId === homeId && recordAwayId === awayId) ||
              (recordHomeId === awayId && recordAwayId === homeId);
            if (!samePair) continue;
            scoresLast5.push(`${homeGoals}-${awayGoals}`);
            if (homeGoals === awayGoals) draws++;
            else if ((currentHomeAtVenue && homeGoals > awayGoals) || (!currentHomeAtVenue && awayGoals > homeGoals)) homeWins++;
            else awayWins++;
          }
          if (scoresLast5.length > 0) {
            update.h2h = { homeWins, draws, awayWins, totalLast5: scoresLast5.length, scoresLast5 } as H2HRecord;
          }
        } catch (err) {
          errors.push(`API-Football H2H ${fixture.homeTeam.name} / ${fixture.awayTeam.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    Object.assign(fixture, update);
  }

  let sportmonksMappedFixtures = 0;
  // Sportmonks is an independent schedule source. Add only genuinely new pairings;
  // it does not overwrite a fixture already sourced from another provider.
  for (const raw of sportmonksRaw) {
    const mapped = mapSportmonksFixture(raw);
    if (!mapped) continue;
    sportmonksMappedFixtures++;
    const key = fixtureKey(mapped);
    if (!enrichedKeys.has(key)) {
      enriched.push(mapped);
      enrichedKeys.add(key);
    } else {
      const existing = enriched.find((f) => fixtureKey(f) === key);
      if (existing && !existing.sportmonksFixtureId) {
        (existing as any).sportmonksFixtureId = (mapped as any).sportmonksFixtureId;
        (existing as any).sportmonksLeagueId = (mapped as any).sportmonksLeagueId;
      }
    }
  }



  const enrichedTeams = enriched.filter((f) => Array.isArray(f.homeTeam.form) && f.homeTeam.form.length > 0 &&
    Array.isArray(f.awayTeam.form) && f.awayTeam.form.length > 0).length;
  return { fixtures: enriched, apiFootballFixtures: apiRaw.length, sportmonksFixtures: sportmonksRaw.length, apiFootballMappedFixtures, sportmonksMappedFixtures, apiFootballSuccessfulRequests, sportmonksSuccessfulRequests, apiFootballFailedRequests, sportmonksFailedRequests, enrichedTeams, errors };
}

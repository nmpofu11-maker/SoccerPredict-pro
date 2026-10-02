import { TeamStats, HistoricalMatchResult } from '../types/soccer';
import { HISTORICAL_MATCH_RESULTS } from '../data/historical_results';

export interface FormMatchItem {
  result: 'W' | 'D' | 'L';
  opponent?: string;
  opponentShortName?: string;
  score?: string; // e.g. "2-1"
  venue?: 'H' | 'A';
  date?: string;
  league?: string;
  isFromHistoricalMatch: boolean;
  matchId?: string;
  index: number; // 0 (oldest) to 4 (most recent)
}

export interface CalculatedTeamForm {
  teamName: string;
  matches: FormMatchItem[]; // Exactly 5 items, sorted chronological (0: oldest -> 4: most recent)
  wins: number;
  draws: number;
  losses: number;
  points: number; // wins * 3 + draws * 1 (max 15)
  pointsPercentage: number; // (points / 15) * 100
  pointsPerGame: string; // e.g. "2.2"
  unbeatenStreak: number;
  historicalMatchesCount: number;
  streakLabel: string;
}

export interface FormComparison {
  homeForm: CalculatedTeamForm;
  awayForm: CalculatedTeamForm;
  pointsDiff: number; // home.points - away.points
  advantage: 'home' | 'away' | 'equal';
  differentialLabel: string;
}

/**
 * Normalizes a team name for reliable matching against historical records
 */
export function normalizeTeamName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bfc\b|\bcf\b|\bsc\b|\bafc\b|\bf\.c\.\b|\bclub\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Checks if two team names refer to the same club
 */
export function matchesTeamName(name1: string, name2: string): boolean {
  const n1 = normalizeTeamName(name1);
  const n2 = normalizeTeamName(name2);
  if (!n1 || !n2) return false;
  // Partial substring matches merge distinct clubs (e.g. city/reserve teams).
  // Only exact normalized identities are safe without a provider team ID or alias map.
  return n1 === n2;
}

const historicalMatchesCache = new Map<string, FormMatchItem[]>();

/**
 * Extracts all matching historical match results for a given team,
 * sorted chronologically (oldest to newest).
 */
export function getHistoricalMatchesForTeam(
  teamName: string,
  historicalResults: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS
): FormMatchItem[] {
  if (!teamName) return [];

  const matches: { date: string; item: FormMatchItem }[] = [];

  for (const match of historicalResults) {
    if (!match || !match.fixture || !match.fixture.homeTeam || !match.fixture.awayTeam) continue;
    const isHome = matchesTeamName(match.fixture.homeTeam.name, teamName);
    const isAway = !isHome && matchesTeamName(match.fixture.awayTeam.name, teamName);

    if (!isHome && !isAway) continue;

    let result: 'W' | 'D' | 'L';
    let score: string;
    let opponent: string;
    let opponentShortName: string;
    let venue: 'H' | 'A';

    if (isHome) {
      venue = 'H';
      opponent = match.fixture.awayTeam.name;
      opponentShortName = match.fixture.awayTeam.shortName || opponent.slice(0, 3).toUpperCase();
      score = `${match.homeScore ?? 0}-${match.awayScore ?? 0}`;
      if (match?.actualOutcome === 'home') result = 'W';
      else if (match?.actualOutcome === 'draw') result = 'D';
      else result = 'L';
    } else {
      venue = 'A';
      opponent = match.fixture.homeTeam.name;
      opponentShortName = match.fixture.homeTeam.shortName || opponent.slice(0, 3).toUpperCase();
      score = `${match.awayScore ?? 0}-${match.homeScore ?? 0}`;
      if (match?.actualOutcome === 'away') result = 'W';
      else if (match?.actualOutcome === 'draw') result = 'D';
      else result = 'L';
    }

    matches.push({
      date: match.date || match.fixture.kickoffTime || '',
      item: {
        result,
        opponent,
        opponentShortName,
        score,
        venue,
        date: match.date,
        league: match.fixture.league,
        isFromHistoricalMatch: true,
        matchId: match.id,
        index: 0,
      },
    });
  }

  // Sort chronological: oldest to newest
  matches.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const result = matches.map((m) => m.item);
  return result;
}

/**
 * Calculates the 5-match form trend (W/D/L) for a team using historical results data.
 * Combines verified match outcomes from the historical results database with the team's
 * established prior league form sequence to ensure an exact, high-fidelity 5-game trajectory.
 */
export function calculateTeamForm(
  teamName: string,
  teamStats: TeamStats,
  historicalResults: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS
): CalculatedTeamForm {
  const historicalMatches = getHistoricalMatchesForTeam(teamName, historicalResults);
  const baselineForm = Array.isArray(teamStats?.form) ? teamStats.form : [];

  const finalMatches: FormMatchItem[] = [];

  // Determine how many historical matches we can use (up to 5, newest ones)
  const recentHistorical = historicalMatches.slice(-5);
  const neededFromBaseline = Math.max(0, baselineForm.length - recentHistorical.length);

  // Fill earlier matches only from authentic recorded league form (if any)
  const baselineSlice = baselineForm.slice(0, neededFromBaseline);

  // Prepend earlier baseline matches
  for (let i = 0; i < baselineSlice.length; i++) {
    finalMatches.push({
      result: baselineSlice[i],
      isFromHistoricalMatch: false,
      index: finalMatches.length,
    });
  }

  // Append the verified matches from historical results
  for (const histMatch of recentHistorical) {
    finalMatches.push({
      ...histMatch,
      index: finalMatches.length,
    });
  }

  // Re-index so 0 is oldest and N-1 is most recent, attaching scores only when known
  finalMatches.forEach((m, idx) => {
    m.index = idx;
    if (!m.score) {
      if (teamStats?.formScores && teamStats.formScores[idx]) {
        m.score = teamStats.formScores[idx];
      } else if (teamStats?.formDetails && teamStats.formDetails[idx]?.score) {
        m.score = teamStats.formDetails[idx].score;
        m.opponent = m.opponent || teamStats.formDetails[idx].opponent;
        m.venue = m.venue || teamStats.formDetails[idx].venue;
      }
    }
  });

  // Calculate stats
  let wins = 0;
  let draws = 0;
  let losses = 0;

  for (const m of finalMatches) {
    if (m.result === 'W') wins++;
    else if (m.result === 'D') draws++;
    else if (m.result === 'L') losses++;
  }

  const matchCount = finalMatches.length;
  const points = wins * 3 + draws * 1;
  const pointsPercentage = matchCount > 0 ? Math.round((points / (matchCount * 3)) * 100) : 0;
  const pointsPerGame = matchCount > 0 ? (points / matchCount).toFixed(1) : '0.0';

  // Calculate current unbeaten streak counting backwards from the most recent match
  let unbeatenStreak = 0;
  for (let i = finalMatches.length - 1; i >= 0; i--) {
    if (finalMatches[i].result === 'W' || finalMatches[i].result === 'D') {
      unbeatenStreak++;
    } else {
      break;
    }
  }

  // Streak Label
  let streakLabel = matchCount > 0 ? `${wins}W ${draws}D ${losses}L` : 'No Match Form';
  if (matchCount >= 5 && wins === 5) {
    streakLabel = '5W Win Streak 🔥';
  } else if (matchCount >= 5 && unbeatenStreak === 5) {
    streakLabel = `Unbeaten in 5 (${points} pts)`;
  } else if (unbeatenStreak >= 3) {
    streakLabel = `${unbeatenStreak} Match Unbeaten`;
  } else if (matchCount >= 4 && wins >= 4) {
    streakLabel = `High Form (${points} pts)`;
  } else if (matchCount >= 4 && losses >= 3) {
    streakLabel = `Cold Form (${points} pts)`;
  }

  return {
    teamName,
    matches: finalMatches,
    wins,
    draws,
    losses,
    points,
    pointsPercentage,
    pointsPerGame,
    unbeatenStreak,
    historicalMatchesCount: recentHistorical.length,
    streakLabel,
  };
}

/**
 * Calculates comparative form metrics between Home and Away teams
 */
export function calculateMatchFormComparison(
  homeForm: CalculatedTeamForm,
  awayForm: CalculatedTeamForm
): FormComparison {
  const pointsDiff = homeForm.points - awayForm.points;
  let advantage: 'home' | 'away' | 'equal' = 'equal';
  let differentialLabel = 'Form Parity (Equal Points)';

  if (homeForm.matches.length === 0 && awayForm.matches.length === 0) {
    differentialLabel = 'Form Unobserved';
  } else if (pointsDiff > 0) {
    advantage = 'home';
    differentialLabel = `+${pointsDiff} ${pointsDiff === 1 ? 'pt' : 'pts'} Home Momentum`;
  } else if (pointsDiff < 0) {
    advantage = 'away';
    differentialLabel = `+${Math.abs(pointsDiff)} ${Math.abs(pointsDiff) === 1 ? 'pt' : 'pts'} Away Momentum`;
  }

  return {
    homeForm,
    awayForm,
    pointsDiff,
    advantage,
    differentialLabel,
  };
}

/**
 * Generates a stable, realistic full-time score matching the match result
 */
export function getDeterministicFtScore(
  teamName: string,
  idx: number,
  result: 'W' | 'D' | 'L'
): string {
  let hash = 0;
  const str = `${teamName}_${idx}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33 + str.charCodeAt(i)) % 10000;
  }
  if (result === 'W') {
    const winScores = ['2-1', '1-0', '3-1', '2-0', '3-2', '4-1', '3-0', '1-0', '2-1'];
    return winScores[hash % winScores.length];
  } else if (result === 'D') {
    const drawScores = ['1-1', '0-0', '2-2', '1-1', '0-0', '2-2', '3-3'];
    return drawScores[hash % drawScores.length];
  } else {
    const lossScores = ['1-2', '0-1', '1-3', '0-2', '2-3', '0-3', '1-4', '0-1', '1-2'];
    return lossScores[hash % lossScores.length];
  }
}

export interface FormResultBadgeData {
  result: 'W' | 'D' | 'L';
  score: string; // FT score, e.g. "2-1", "1-0", "0-0"
  opponent?: string;
  venue?: 'H' | 'A';
  date?: string;
  isHistorical: boolean;
  matchIndex: number;
  label: string; // e.g. "Match 5 (Latest)"
  tooltipTitle: string; // e.g. "FT: 2-1 (Win) vs Chelsea [Home]"
}

/**
 * Returns only observed match details. Missing full-time scores remain unavailable.
 */
export function getTeamFormBadgesData(
  team: TeamStats,
  historicalResults: HistoricalMatchResult[] = HISTORICAL_MATCH_RESULTS
): FormResultBadgeData[] {
  const calculated = calculateTeamForm(team.name, team, historicalResults);
  return calculated.matches.map((m, idx) => {
    const resultWord =
      m.result === 'W'
        ? 'Win (3 pts)'
        : m.result === 'D'
        ? 'Draw (1 pt)'
        : 'Loss (0 pts)';
    const scoreStr = m.score ? `FT: ${m.score}` : 'Result:';
    const opponentPart = m.opponent ? ` vs ${m.opponent}` : '';
    const venuePart = m.venue ? ` [${m.venue === 'H' ? 'Home' : 'Away'}]` : '';
    const matchLabel = idx === calculated.matches.length - 1 ? `Match ${idx + 1} (Latest)` : `Match ${idx + 1}`;

    return {
      result: m.result,
      // A W/D/L outcome is not a score. Keep the score empty when no FT score exists.
      score: m.score || '',
      opponent: m.opponent,
      venue: m.venue,
      date: m.date,
      isHistorical: m.isFromHistoricalMatch,
      matchIndex: idx,
      label: matchLabel,
      tooltipTitle: `${scoreStr} ${resultWord}${opponentPart}${venuePart}`,
    };
  });
}


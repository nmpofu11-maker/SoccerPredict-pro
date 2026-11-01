import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTeamFormFromFinishedMatches,
  resolveCompetitionCode,
  computeH2HFromFinishedMatches,
  enrichFixturesWithFootballData,
  FootballDataRateLimitError,
  type RawFinishedMatch,
} from '../src/services/serverFootballData';
import { evaluateFixturePrediction } from '../src/engine/rulesEngine';
import type { MatchFixture } from '../src/types/soccer';

test('serverFootballData: form computed correctly and in chronological order', () => {
  const finishedMatches: RawFinishedMatch[] = [
    {
      id: 101,
      utcDate: '2026-09-01T15:00:00Z',
      status: 'FINISHED',
      homeTeam: { id: 1, name: 'Arsenal FC', shortName: 'Arsenal' },
      awayTeam: { id: 2, name: 'Chelsea FC', shortName: 'Chelsea' },
      score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } },
    },
    {
      id: 102,
      utcDate: '2026-09-08T15:00:00Z',
      status: 'FINISHED',
      homeTeam: { id: 3, name: 'Fulham FC', shortName: 'Fulham' },
      awayTeam: { id: 1, name: 'Arsenal FC', shortName: 'Arsenal' },
      score: { winner: 'DRAW', fullTime: { home: 1, away: 1 } },
    },
    {
      id: 103,
      utcDate: '2026-09-15T15:00:00Z',
      status: 'FINISHED',
      homeTeam: { id: 1, name: 'Arsenal FC', shortName: 'Arsenal' },
      awayTeam: { id: 4, name: 'Tottenham Hotspur FC', shortName: 'Tottenham' },
      score: { winner: 'AWAY_TEAM', fullTime: { home: 0, away: 2 } },
    },
    {
      id: 104,
      utcDate: '2026-09-22T15:00:00Z',
      status: 'FINISHED',
      homeTeam: { id: 5, name: 'Everton FC', shortName: 'Everton' },
      awayTeam: { id: 1, name: 'Arsenal FC', shortName: 'Arsenal' },
      score: { winner: 'AWAY_TEAM', fullTime: { home: 1, away: 3 } },
    },
  ];

  const kickoff = '2026-10-01T15:00:00Z';
  const res = computeTeamFormFromFinishedMatches('Arsenal', finishedMatches, kickoff);

  // Chronological order:
  // Match 1: Arsenal (H) 2-1 Chelsea -> W
  // Match 2: Arsenal (A) 1-1 Fulham -> D
  // Match 3: Arsenal (H) 0-2 Tottenham -> L
  // Match 4: Arsenal (A) 3-1 Everton -> W
  assert.deepEqual(res.form, ['W', 'D', 'L', 'W']);
  assert.deepEqual(res.formScores, ['2-1', '1-1', '0-2', '3-1']);
  assert.equal(res.formDetails.length, 4);
  assert.equal(res.formDetails[0].result, 'W');
  assert.equal(res.formDetails[0].venue, 'H');
  assert.equal(res.formDetails[1].result, 'D');
  assert.equal(res.formDetails[1].venue, 'A');
});

test('serverFootballData: matches after kickoff are strictly excluded', () => {
  const finishedMatches: RawFinishedMatch[] = [
    {
      id: 201,
      utcDate: '2026-09-20T15:00:00Z',
      status: 'FINISHED',
      homeTeam: { id: 1, name: 'Liverpool FC', shortName: 'Liverpool' },
      awayTeam: { id: 2, name: 'Bournemouth', shortName: 'Bournemouth' },
      score: { winner: 'HOME_TEAM', fullTime: { home: 3, away: 0 } },
    },
    {
      id: 202,
      utcDate: '2026-10-05T15:00:00Z', // Occurred AFTER the kickoff of 2026-10-01
      status: 'FINISHED',
      homeTeam: { id: 1, name: 'Liverpool FC', shortName: 'Liverpool' },
      awayTeam: { id: 3, name: 'Aston Villa', shortName: 'Aston Villa' },
      score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 0 } },
    },
  ];

  const kickoff = '2026-10-01T15:00:00Z';
  const res = computeTeamFormFromFinishedMatches('Liverpool', finishedMatches, kickoff);

  assert.equal(res.form.length, 1);
  assert.deepEqual(res.form, ['W']);
  assert.deepEqual(res.formScores, ['3-0']);
});

test('serverFootballData: an unmatched team gives empty form []', () => {
  const finishedMatches: RawFinishedMatch[] = [
    {
      id: 301,
      utcDate: '2026-09-20T15:00:00Z',
      status: 'FINISHED',
      homeTeam: { id: 1, name: 'Real Madrid', shortName: 'Real Madrid' },
      awayTeam: { id: 2, name: 'Barcelona', shortName: 'Barcelona' },
      score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } },
    },
  ];

  const res = computeTeamFormFromFinishedMatches('Unknown Nonexistent Club', finishedMatches, '2026-10-01T15:00:00Z');
  assert.deepEqual(res.form, []);
  assert.deepEqual(res.formScores, []);
  assert.deepEqual(res.formDetails, []);
});

test('serverFootballData: HTTP 429 retries once and then logs warning and stops batch', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.FOOTBALL_DATA_KEY;
  const originalSpacing = process.env.FOOTBALL_DATA_REQUEST_SPACING_MS;

  process.env.FOOTBALL_DATA_KEY = 'test-token';
  process.env.FOOTBALL_DATA_REQUEST_SPACING_MS = '10';

  let fetchCount = 0;
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    warnings.push(args.join(' '));
  };

  try {
    globalThis.fetch = (async (_url: any) => {
      fetchCount++;
      return new Response('Rate limit reached', { status: 429 });
    }) as any;

    const fixture: MatchFixture = {
      id: 'fix-429-test',
      kickoffTime: '2026-10-15T15:00:00Z',
      league: 'Premier League',
      venue: 'Emirates Stadium',
      isHighStakes: false,
      motivation: 'regular',
      homeTeam: { id: 'h1', name: 'Arsenal', shortName: 'ARS', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null, isHomeDominant: false, hasTopTierAwayForm: false },
      awayTeam: { id: 'a1', name: 'Chelsea', shortName: 'CHE', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null, isHomeDominant: false, hasTopTierAwayForm: false },
      h2h: null,
    };

    const res = await enrichFixturesWithFootballData([fixture]);

    // Should have attempted fetch, retried once (total 2 calls), then stopped
    assert.equal(fetchCount, 2, 'Should attempt once and retry once on 429');
    assert.equal(warnings.length, 1, 'Should log exactly one rate-limit warning');
    assert.match(warnings[0], /Rate limit reached/i);
    assert.equal(res.enrichedCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.FOOTBALL_DATA_KEY = originalKey;
    process.env.FOOTBALL_DATA_REQUEST_SPACING_MS = originalSpacing;
    console.warn = originalWarn;
  }
});

test('South African Premier League is not mistaken for the English Premier League', () => {
  assert.equal(resolveCompetitionCode('South Africa • Premier League'), null);
  assert.equal(resolveCompetitionCode('England • Premier League'), 'PL');
});

test('Rule 4 H2H: null h2h cleanly skips Rule 4; populated 4+ home wins triggers Rule 4', () => {
  const baseFixture: MatchFixture = {
    id: 'h2h-test',
    kickoffTime: '2026-10-15T15:00:00Z',
    league: 'Premier League',
    venue: 'Test Ground',
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: { id: 'h1', name: 'Home Team', shortName: 'HOM', leagueRank: 10, points: 20, standingsSource: 'FOOTBALL_DATA_ORG', form: ['D'], formSource: 'FOOTBALL_DATA_ORG', avgPossession: null, avgShotsOnTarget: null, isHomeDominant: false, hasTopTierAwayForm: false },
    awayTeam: { id: 'a1', name: 'Away Team', shortName: 'AWA', leagueRank: 11, points: 19, standingsSource: 'FOOTBALL_DATA_ORG', form: ['D'], formSource: 'FOOTBALL_DATA_ORG', avgPossession: null, avgShotsOnTarget: null, isHomeDominant: false, hasTopTierAwayForm: false },
    h2h: null,
  };

  // Null path: Rule 4 should not fire
  const predNull = evaluateFixturePrediction(baseFixture, 'none');
  const rule4Null = predNull.appliedRules.find((r) => r.ruleNumber === 4);
  assert.equal(rule4Null, undefined, 'Rule 4 must not fire when h2h is null');

  // Populated path: 4 home wins in last 5 meetings triggers Rule 4
  const populatedFixture: MatchFixture = {
    ...baseFixture,
    h2h: {
      homeWins: 4,
      draws: 1,
      awayWins: 0,
      totalLast5: 5,
      scoresLast5: ['2-0', '1-0', '2-1', '0-0', '3-1'],
      source: 'API_FOOTBALL',
    },
  };

  const predPopulated = evaluateFixturePrediction(populatedFixture, 'none');
  const rule4Populated = predPopulated.appliedRules.find((r) => r.ruleNumber === 4);
  assert.ok(rule4Populated, 'Rule 4 must fire when homeWins >= 4');
  assert.equal(rule4Populated.beneficiary, 'home');
  assert.match(rule4Populated.ruleName, /H2H/i);
});

test('Football-Data fallback preserves already-verified primary provider evidence', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.FOOTBALL_DATA_KEY;
  process.env.FOOTBALL_DATA_KEY = 'test-token';

  try {
    globalThis.fetch = (async (url: any) => {
      const value = String(url);
      if (value.includes('/standings')) {
        return new Response(JSON.stringify({
          standings: [{
            type: 'TOTAL',
            table: [
              { position: 9, points: 12, team: { id: 1, name: 'Arsenal FC', shortName: 'Arsenal' } },
              { position: 2, points: 30, team: { id: 2, name: 'Chelsea FC', shortName: 'Chelsea' } },
            ],
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        matches: [{
          id: 1,
          utcDate: '2026-09-30T15:00:00Z',
          status: 'FINISHED',
          homeTeam: { id: 1, name: 'Arsenal FC', shortName: 'Arsenal' },
          awayTeam: { id: 3, name: 'Fulham FC', shortName: 'Fulham' },
          score: { winner: 'HOME_TEAM', fullTime: { home: 4, away: 0 } },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as any;

    const fixture: MatchFixture = {
      id: 'primary-precedence-test',
      kickoffTime: '2026-10-15T15:00:00Z',
      league: 'England • Premier League',
      venue: 'Emirates Stadium',
      isHighStakes: false,
      motivation: 'regular',
      homeTeam: {
        id: 'sportapi_team_1',
        name: 'Arsenal',
        shortName: 'ARS',
        leagueRank: 2,
        points: 28,
        standingsSource: 'SPORTAPI_AI',
        form: ['W', 'W', 'D', 'W', 'W'],
        formSource: 'SPORTAPI_AI',
        avgPossession: null,
        avgShotsOnTarget: null,
        isHomeDominant: false,
        hasTopTierAwayForm: false,
      },
      awayTeam: {
        id: 'sportapi_team_2',
        name: 'Chelsea',
        shortName: 'CHE',
        leagueRank: 6,
        points: 20,
        standingsSource: 'SPORTAPI_AI',
        form: ['L', 'W', 'D', 'W', 'L'],
        formSource: 'SPORTAPI_AI',
        avgPossession: null,
        avgShotsOnTarget: null,
        isHomeDominant: false,
        hasTopTierAwayForm: false,
      },
      h2h: {
        homeWins: 3,
        draws: 1,
        awayWins: 1,
        totalLast5: 5,
        scoresLast5: ['2-1', '1-0', '1-1', '0-1', '3-2'],
        source: 'SPORTAPI_AI',
      },
    };

    const result = await enrichFixturesWithFootballData([fixture]);
    assert.equal(result.enrichedCount, 0, 'Fallback should not report an update when all targeted fields are already verified');
    const actual = result.fixtures[0];

    assert.equal(actual.homeTeam.leagueRank, 2);
    assert.equal(actual.homeTeam.points, 28);
    assert.equal(actual.homeTeam.standingsSource, 'SPORTAPI_AI');
    assert.deepEqual(actual.homeTeam.form, ['W', 'W', 'D', 'W', 'W']);
    assert.equal(actual.homeTeam.formSource, 'SPORTAPI_AI');

    assert.equal(actual.awayTeam.leagueRank, 6);
    assert.equal(actual.awayTeam.points, 20);
    assert.equal(actual.awayTeam.standingsSource, 'SPORTAPI_AI');
    assert.deepEqual(actual.awayTeam.form, ['L', 'W', 'D', 'W', 'L']);
    assert.equal(actual.awayTeam.formSource, 'SPORTAPI_AI');

    assert.equal(actual.h2h?.source, 'SPORTAPI_AI');
    assert.deepEqual(actual.h2h?.scoresLast5, ['2-1', '1-0', '1-1', '0-1', '3-2']);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.FOOTBALL_DATA_KEY = originalKey;
  }
});

test('Football-Data skips network calls when all fixtures in a competition are fully evidenced, and preserves verified siblings when mixed', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.FOOTBALL_DATA_KEY;
  const originalSpacing = process.env.FOOTBALL_DATA_REQUEST_SPACING_MS;
  process.env.FOOTBALL_DATA_KEY = 'test-token';
  process.env.FOOTBALL_DATA_REQUEST_SPACING_MS = '5';

  let fetchCalls = 0;
  try {
    globalThis.fetch = (async (url: any) => {
      fetchCalls++;
      const value = String(url);
      if (value.includes('/standings')) {
        return new Response(JSON.stringify({
          standings: [{
            type: 'TOTAL',
            table: [
              { position: 9, points: 12, team: { id: 1, name: 'Arsenal FC', shortName: 'Arsenal' } },
              { position: 4, points: 24, team: { id: 3, name: 'Liverpool FC', shortName: 'Liverpool' } },
              { position: 7, points: 18, team: { id: 4, name: 'Everton FC', shortName: 'Everton' } },
            ],
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ matches: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as any;

    const verifiedFixture: MatchFixture = {
      id: 'verified-pl',
      kickoffTime: '2026-10-15T15:00:00Z',
      league: 'England • Premier League',
      venue: 'Emirates Stadium',
      isHighStakes: false,
      motivation: 'regular',
      homeTeam: {
        id: 'h1',
        name: 'Arsenal',
        shortName: 'ARS',
        leagueRank: 2,
        points: 28,
        standingsSource: 'SPORTAPI_AI',
        form: ['W', 'W', 'D', 'W', 'W'],
        formSource: 'SPORTAPI_AI',
        avgPossession: null,
        avgShotsOnTarget: null,
        isHomeDominant: false,
        hasTopTierAwayForm: false,
      },
      awayTeam: {
        id: 'a1',
        name: 'Chelsea',
        shortName: 'CHE',
        leagueRank: 6,
        points: 20,
        standingsSource: 'SPORTAPI_AI',
        form: ['L', 'W', 'D', 'W', 'L'],
        formSource: 'SPORTAPI_AI',
        avgPossession: null,
        avgShotsOnTarget: null,
        isHomeDominant: false,
        hasTopTierAwayForm: false,
      },
      h2h: {
        homeWins: 3,
        draws: 1,
        awayWins: 1,
        totalLast5: 5,
        scoresLast5: ['2-1', '1-0', '1-1', '0-1', '3-2'],
        source: 'SPORTAPI_AI',
      },
    };

    await enrichFixturesWithFootballData([verifiedFixture]);
    assert.equal(fetchCalls, 0, 'Should make zero HTTP calls when all fixtures in the league already have verified standings, form, and H2H');

    const unverifiedSibling: MatchFixture = {
      id: 'unverified-pl',
      kickoffTime: '2026-10-15T17:30:00Z',
      league: 'England • Premier League',
      venue: 'Anfield',
      isHighStakes: false,
      motivation: 'regular',
      homeTeam: {
        id: 'h2',
        name: 'Liverpool',
        shortName: 'LIV',
        leagueRank: null,
        points: null,
        form: [],
        avgPossession: null,
        avgShotsOnTarget: null,
        isHomeDominant: false,
        hasTopTierAwayForm: false,
      },
      awayTeam: {
        id: 'a2',
        name: 'Everton',
        shortName: 'EVE',
        leagueRank: null,
        points: null,
        form: [],
        avgPossession: null,
        avgShotsOnTarget: null,
        isHomeDominant: false,
        hasTopTierAwayForm: false,
      },
      h2h: null,
    };

    const mixedResult = await enrichFixturesWithFootballData([verifiedFixture, unverifiedSibling]);
    assert.equal(fetchCalls, 2, 'Should fetch standings and matches once for the shared competition');
    assert.equal(mixedResult.enrichedCount, 1);
    assert.equal(mixedResult.fixtures[0].homeTeam.leagueRank, 2, 'Verified sibling rank must remain untouched');
    assert.equal(mixedResult.fixtures[1].homeTeam.leagueRank, 4, 'Unverified sibling should receive Football-Data rank');
    assert.equal(mixedResult.fixtures[1].awayTeam.leagueRank, 7);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.FOOTBALL_DATA_KEY = originalKey;
    process.env.FOOTBALL_DATA_REQUEST_SPACING_MS = originalSpacing;
  }
});

test('Football-Data honors upstream Wait-N-seconds HTTP 429 hint and recovers on retry', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.FOOTBALL_DATA_KEY;
  const originalSpacing = process.env.FOOTBALL_DATA_REQUEST_SPACING_MS;
  process.env.FOOTBALL_DATA_KEY = 'test-token';
  delete process.env.FOOTBALL_DATA_REQUEST_SPACING_MS;

  let attempts = 0;
  try {
    globalThis.fetch = (async () => {
      attempts++;
      if (attempts === 1) {
        return new Response(
          JSON.stringify({ message: 'You reached your request limit. Wait 0 seconds.', errorCode: 429 }),
          { status: 429, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          standings: [{
            type: 'TOTAL',
            table: [{ position: 1, points: 33, team: { id: 10, name: 'Paris Saint-Germain FC', shortName: 'PSG' } }],
          }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as any;

    const fixture: MatchFixture = {
      id: 'fl1-retry-recovery',
      kickoffTime: '2026-10-31T20:00:00Z',
      league: 'France • Ligue 1',
      venue: 'Parc des Princes',
      isHighStakes: false,
      motivation: 'regular',
      homeTeam: {
        id: 'psg',
        name: 'Paris Saint-Germain FC',
        shortName: 'PSG',
        leagueRank: null,
        points: null,
        form: ['W', 'W', 'W', 'D', 'W'],
        formSource: 'SPORTAPI_AI',
        avgPossession: null,
        avgShotsOnTarget: null,
        isHomeDominant: false,
        hasTopTierAwayForm: false,
      },
      awayTeam: {
        id: 'om',
        name: 'Olympique de Marseille',
        shortName: 'OM',
        leagueRank: 2,
        points: 26,
        standingsSource: 'SPORTAPI_AI',
        form: ['W', 'L', 'W', 'W', 'D'],
        formSource: 'SPORTAPI_AI',
        avgPossession: null,
        avgShotsOnTarget: null,
        isHomeDominant: false,
        hasTopTierAwayForm: false,
      },
      h2h: {
        homeWins: 4,
        draws: 1,
        awayWins: 0,
        totalLast5: 5,
        scoresLast5: ['3-0', '2-0', '4-0', '0-0', '2-1'],
        source: 'SPORTAPI_AI',
      },
    };

    const res = await enrichFixturesWithFootballData([fixture]);
    assert.equal(attempts, 2, 'Should retry after upstream Wait hint and succeed');
    assert.equal(res.errors.length, 0);
    assert.equal(res.enrichedCount, 1);
    assert.equal(res.fixtures[0].homeTeam.leagueRank, 1);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.FOOTBALL_DATA_KEY = originalKey;
    if (originalSpacing === undefined) {
      delete process.env.FOOTBALL_DATA_REQUEST_SPACING_MS;
    } else {
      process.env.FOOTBALL_DATA_REQUEST_SPACING_MS = originalSpacing;
    }
  }
});


import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFixturePrediction, fixtureHasEvidence } from '../src/engine/rulesEngine';
import { verifyAndSanitizeFixture, verifyAndSanitizeFixtures } from '../src/services/dataIntegrityValidator';
import type { MatchFixture } from '../src/types/soccer';

test('regression: two fixtures with different verified team form produce independently calculated predictions', () => {
  const fixtureA: MatchFixture = {
    id: 'match-audit-1',
    kickoffTime: '2026-10-15T15:00:00Z',
    league: 'Premier League',
    venue: 'Emirates Stadium',
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: {
      id: 'team-ars',
      name: 'Arsenal',
      shortName: 'ARS',
      leagueRank: 2,
      points: 20,
      standingsSource: 'SPORTAPI_AI',
      form: ['W', 'W', 'W', 'W', 'W'],
      formSource: 'SPORTAPI_AI',
      avgPossession: 60,
      avgShotsOnTarget: 7,
      matchStatsSource: 'SPORTAPI_AI',
      isHomeDominant: true,
      hasTopTierAwayForm: false,
    },
    awayTeam: {
      id: 'team-sou',
      name: 'Southampton',
      shortName: 'SOU',
      leagueRank: 19,
      points: 4,
      standingsSource: 'SPORTAPI_AI',
      form: ['L', 'L', 'L', 'D', 'L'],
      formSource: 'SPORTAPI_AI',
      avgPossession: 40,
      avgShotsOnTarget: 2,
      matchStatsSource: 'SPORTAPI_AI',
      isHomeDominant: false,
      hasTopTierAwayForm: false,
    },
    h2h: null,
  };

  const fixtureB: MatchFixture = {
    id: 'match-audit-2',
    kickoffTime: '2026-10-15T17:30:00Z',
    league: 'Premier League',
    venue: 'Anfield',
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: {
      id: 'team-liv',
      name: 'Liverpool',
      shortName: 'LIV',
      leagueRank: 10,
      points: 12,
      standingsSource: 'SPORTAPI_AI',
      form: ['D', 'D', 'D', 'D', 'D'],
      formSource: 'SPORTAPI_AI',
      avgPossession: 50,
      avgShotsOnTarget: 4,
      matchStatsSource: 'SPORTAPI_AI',
      isHomeDominant: false,
      hasTopTierAwayForm: false,
    },
    awayTeam: {
      id: 'team-che',
      name: 'Chelsea',
      shortName: 'CHE',
      leagueRank: 9,
      points: 13,
      standingsSource: 'SPORTAPI_AI',
      form: ['D', 'D', 'D', 'D', 'D'],
      formSource: 'SPORTAPI_AI',
      avgPossession: 50,
      avgShotsOnTarget: 4,
      matchStatsSource: 'SPORTAPI_AI',
      isHomeDominant: false,
      hasTopTierAwayForm: false,
    },
    h2h: null,
  };

  const predA = evaluateFixturePrediction(fixtureA, 'none');
  const predB = evaluateFixturePrediction(fixtureB, 'none');

  assert.notEqual(predA.homeWinPct, predB.homeWinPct, 'Fixtures with different strength profiles must have different probabilities');
  assert.notEqual(predA.drawPct, predB.drawPct, 'Draw probabilities must be calculated independently');
  assert.equal(predA.predictedWinner, 'home', 'Arsenal vs Southampton should predict home');
  assert.ok(predA.homeWinPct > predB.homeWinPct, 'Arsenal (rank 2 vs 19) must have higher home win pct than balanced midtable match');
});

test('regression: different standings produce the correct individual evidence and point calculations', () => {
  const topVsBottom: MatchFixture = {
    id: 'match-standings-1',
    kickoffTime: '2026-10-15T15:00:00Z',
    league: 'La Liga',
    venue: 'Bernabeu',
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: {
      id: 'team-rma',
      name: 'Real Madrid',
      shortName: 'RMA',
      leagueRank: 1,
      points: 25,
      standingsSource: 'SPORTMONKS',
      form: ['W', 'W', 'W', 'W', 'W'],
      formSource: 'SPORTMONKS',
      avgPossession: null,
      avgShotsOnTarget: null,
      isHomeDominant: false,
      hasTopTierAwayForm: false,
    },
    awayTeam: {
      id: 'team-leg',
      name: 'Leganes',
      shortName: 'LEG',
      leagueRank: 20,
      points: 3,
      standingsSource: 'SPORTMONKS',
      form: ['L', 'L', 'L', 'L', 'L'],
      formSource: 'SPORTMONKS',
      avgPossession: null,
      avgShotsOnTarget: null,
      isHomeDominant: false,
      hasTopTierAwayForm: false,
    },
    h2h: null,
  };

  const pred = evaluateFixturePrediction(topVsBottom, 'none');
  assert.ok(pred.homeWinPct > 60, 'Dominant rank 1 vs 20 should produce high home win percentage');
  assert.ok(pred.appliedRules.some(r => r.ruleName === 'Position Gap Edge'), 'Position gap rule must apply');
});

test('regression: one fixture data cannot leak into another fixture', () => {
  const sanitized = verifyAndSanitizeFixtures([
    {
      id: 'fixture-isolated-1',
      kickoffTime: '2026-10-15T15:00:00Z',
      league: 'Serie A',
      venue: 'San Siro',
      isHighStakes: false,
      motivation: 'regular',
      homeTeam: { id: 'team-int', name: 'Inter Milan', shortName: 'INT', leagueRank: 1, points: 21, standingsSource: 'SPORTAPI_AI', form: ['W', 'W', 'W'], formSource: 'SPORTAPI_AI', avgPossession: null, avgShotsOnTarget: null, isHomeDominant: false, hasTopTierAwayForm: false },
      awayTeam: { id: 'team-mon', name: 'Monza', shortName: 'MON', leagueRank: 18, points: 4, standingsSource: 'SPORTAPI_AI', form: ['L', 'L', 'L'], formSource: 'SPORTAPI_AI', avgPossession: null, avgShotsOnTarget: null, isHomeDominant: false, hasTopTierAwayForm: false },
      h2h: null,
    },
    {
      id: 'fixture-isolated-2',
      kickoffTime: '2026-10-15T18:00:00Z',
      league: 'Serie A',
      venue: 'Olimpico',
      isHighStakes: false,
      motivation: 'regular',
      homeTeam: { id: 'team-rom', name: 'Roma', shortName: 'ROM', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null, isHomeDominant: false, hasTopTierAwayForm: false },
      awayTeam: { id: 'team-laz', name: 'Lazio', shortName: 'LAZ', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null, isHomeDominant: false, hasTopTierAwayForm: false },
      h2h: null,
    },
  ]);

  const f1 = sanitized.fixtures[0];
  const f2 = sanitized.fixtures[1];

  assert.equal(f1.homeTeam.leagueRank, 1);
  assert.equal(f2.homeTeam.leagueRank, null, 'Unverified fixture 2 must not inherit rank from fixture 1');
  assert.equal(f2.homeTeam.form.length, 0, 'Unverified fixture 2 must not inherit form from fixture 1');
});

test('regression: missing statistics remain explicitly unavailable and are not fabricated', () => {
  const fixtureWithoutStats: MatchFixture = {
    id: 'no-stats-match',
    kickoffTime: '2026-10-15T15:00:00Z',
    league: 'Championship',
    venue: 'Stadion',
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: { id: 't1', name: 'Team A', shortName: 'TMA', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null, isHomeDominant: false, hasTopTierAwayForm: false },
    awayTeam: { id: 't2', name: 'Team B', shortName: 'TMB', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null, isHomeDominant: false, hasTopTierAwayForm: false },
    h2h: null,
  };

  const { fixture: clean } = verifyAndSanitizeFixture(fixtureWithoutStats);
  assert.equal(clean.homeTeam.avgPossession, null, 'Possession must remain null');
  assert.equal(clean.homeTeam.avgShotsOnTarget, null, 'Shots on target must remain null');
  assert.equal(clean.h2h, null, 'H2H must remain null');
});

test('regression: completely evidence-free fixture is clearly identified as insufficient evidence', () => {
  const blankFixture: MatchFixture = {
    id: 'blank-match',
    kickoffTime: '2026-10-15T15:00:00Z',
    league: 'Youth League',
    venue: 'Field 1',
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: { id: 'u1', name: 'Academy A', shortName: 'ACA', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null, isHomeDominant: false, hasTopTierAwayForm: false },
    awayTeam: { id: 'u2', name: 'Academy B', shortName: 'ACB', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null, isHomeDominant: false, hasTopTierAwayForm: false },
    h2h: null,
  };

  assert.equal(fixtureHasEvidence(blankFixture), false, 'fixtureHasEvidence must return false');
  const pred = evaluateFixturePrediction(blankFixture, 'none');
  assert.equal(pred.predictedWinner, 'none', 'Predicted winner must be none');
  assert.ok(pred.appliedRules.some(r => r.ruleName === 'Team Data Sufficiency Guard'), 'Sufficiency guard must be applied');
});

test('regression: primary SportAPI.ai/Sportmonks evidence is not overwritten by weaker fallback', () => {
  const primaryFixture: MatchFixture = {
    id: 'primary-match',
    kickoffTime: '2026-10-15T15:00:00Z',
    league: 'Premier League',
    venue: 'Stamford Bridge',
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: { id: 't-che', name: 'Chelsea', shortName: 'CHE', leagueRank: 4, points: 15, standingsSource: 'SPORTAPI_AI', form: ['W', 'W', 'D', 'W', 'W'], formSource: 'SPORTAPI_AI', avgPossession: null, avgShotsOnTarget: null, isHomeDominant: false, hasTopTierAwayForm: false },
    awayTeam: { id: 't-new', name: 'Newcastle', shortName: 'NEW', leagueRank: 6, points: 13, standingsSource: 'SPORTAPI_AI', form: ['L', 'W', 'W', 'D', 'L'], formSource: 'SPORTAPI_AI', avgPossession: null, avgShotsOnTarget: null, isHomeDominant: false, hasTopTierAwayForm: false },
    h2h: null,
  };

  const { fixture: validated } = verifyAndSanitizeFixture(primaryFixture);
  assert.equal(validated.homeTeam.standingsSource, 'SPORTAPI_AI', 'SportAPI.ai standingsSource must be preserved');
  assert.equal(validated.homeTeam.leagueRank, 4, 'Home rank must be preserved');
  assert.equal(validated.awayTeam.leagueRank, 6, 'Away rank must be preserved');
  assert.deepEqual(validated.homeTeam.form, ['W', 'W', 'D', 'W', 'W'], 'Home form must be preserved');
});

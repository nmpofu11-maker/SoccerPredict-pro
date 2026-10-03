import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFixturePrediction } from '../src/engine/rulesEngine';
import { verifyAndSanitizeFixture } from '../src/services/dataIntegrityValidator';

function fixture(overrides: Record<string, any> = {}): any {
  return {
    id: 'test-fixture',
    kickoffTime: '2026-10-05T18:00:00.000Z',
    league: 'English Premier League',
    competition: 'English Premier League',
    venue: 'Test Stadium',
    round: 'Test',
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: {
      id: 'home-1',
      name: 'Home United',
      shortName: 'HOM',
      leagueRank: null,
      points: null,
      form: [],
      avgPossession: null,
      avgShotsOnTarget: null,
    },
    awayTeam: {
      id: 'away-1',
      name: 'Away United',
      shortName: 'AWA',
      leagueRank: null,
      points: null,
      form: [],
      avgPossession: null,
      avgShotsOnTarget: null,
    },
    h2h: null,
    ...overrides,
  };
}

test('schedule-only fixtures use the neutral prior', () => {
  const prediction = evaluateFixturePrediction(fixture(), 'none');
  assert.equal(prediction.homeWinPct, 34.8);
  assert.equal(prediction.awayWinPct, 34.8);
  assert.equal(prediction.drawPct, 30.4);
});

test('verified provider form produces fixture-specific probabilities', () => {
  const strongHome = fixture({
    homeTeam: {
      id: 'home-1',
      name: 'Home United',
      shortName: 'HOM',
      leagueRank: 2,
      points: 20,
      standingsSource: 'SPORTAPI_AI',
      form: ['W', 'W', 'W', 'W', 'W'],
      formSource: 'SPORTAPI_AI',
      avgPossession: null,
      avgShotsOnTarget: null,
    },
    awayTeam: {
      id: 'away-1',
      name: 'Away United',
      shortName: 'AWA',
      leagueRank: 18,
      points: 4,
      standingsSource: 'SPORTAPI_AI',
      form: ['L', 'L', 'L', 'L', 'L'],
      formSource: 'SPORTAPI_AI',
      avgPossession: null,
      avgShotsOnTarget: null,
    },
  });

  const strongAway = fixture({
    homeTeam: {
      id: 'home-2',
      name: 'Home United B',
      shortName: 'HMB',
      leagueRank: 18,
      points: 4,
      standingsSource: 'SPORTAPI_AI',
      form: ['L', 'L', 'L', 'L', 'L'],
      formSource: 'SPORTAPI_AI',
      avgPossession: null,
      avgShotsOnTarget: null,
    },
    awayTeam: {
      id: 'away-2',
      name: 'Away United B',
      shortName: 'AWB',
      leagueRank: 2,
      points: 20,
      standingsSource: 'SPORTAPI_AI',
      form: ['W', 'W', 'W', 'W', 'W'],
      formSource: 'SPORTAPI_AI',
      avgPossession: null,
      avgShotsOnTarget: null,
    },
  });

  const homePrediction = evaluateFixturePrediction(strongHome, 'none');
  const awayPrediction = evaluateFixturePrediction(strongAway, 'none');

  assert.notEqual(homePrediction.homeWinPct, awayPrediction.homeWinPct);
  assert.notEqual(homePrediction.awayWinPct, awayPrediction.awayWinPct);
  assert.equal(homePrediction.predictedWinner, 'home');
  assert.equal(awayPrediction.predictedWinner, 'away');
});

test('SportAPI.ai H2H provenance survives integrity sanitization', () => {
  const input = fixture({
    h2h: {
      homeWins: 3,
      awayWins: 1,
      draws: 1,
      totalLast5: 5,
      scoresLast5: ['2-0', '1-1', '0-1', '3-1', '1-0'],
      source: 'SPORTAPI_AI',
    },
  });

  const { fixture: sanitized } = verifyAndSanitizeFixture(input);
  assert.equal(sanitized.h2h?.source, 'SPORTAPI_AI');
  assert.equal(sanitized.h2h?.totalLast5, 5);
});

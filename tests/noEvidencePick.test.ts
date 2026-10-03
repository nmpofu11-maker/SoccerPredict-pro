import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFixturePrediction } from '../src/engine/rulesEngine';
import type { MatchFixture } from '../src/types/soccer';

function makeBaseFixture(overrides: Partial<MatchFixture> = {}): MatchFixture {
  return {
    id: 'test-no-evidence-1',
    kickoffTime: '2026-10-10T15:00:00.000Z',
    league: 'Spanish La Liga',
    competition: 'Spanish La Liga',
    venue: 'Camp Nou',
    round: 'Matchday',
    isHighStakes: false,
    motivation: 'regular',
    homeTeam: {
      id: 'h1',
      name: 'Barcelona',
      shortName: 'BAR',
      leagueRank: null,
      points: null,
      form: [],
      avgPossession: null,
      avgShotsOnTarget: null,
    },
    awayTeam: {
      id: 'a1',
      name: 'Getafe',
      shortName: 'GET',
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

test('(1) schedule-only fixture gives predictedWinner none and hasEvidence false', () => {
  const fixture = makeBaseFixture();
  const result = evaluateFixturePrediction(fixture, 'none');
  assert.equal(result.predictedWinner, 'none');
  assert.equal(result.hasEvidence, false);
});

test('(2) fixture with team ranks 3 vs 14, standingsSource FOOTBALL_DATA_ORG, Spanish La Liga gives home', () => {
  const fixture = makeBaseFixture({
    homeTeam: {
      id: 'h1',
      name: 'Barcelona',
      shortName: 'BAR',
      leagueRank: 3,
      points: 18,
      standingsSource: 'FOOTBALL_DATA_ORG',
      form: ['W', 'W', 'D', 'W', 'W'],
      formSource: 'FOOTBALL_DATA_ORG',
      avgPossession: null,
      avgShotsOnTarget: null,
    },
    awayTeam: {
      id: 'a1',
      name: 'Getafe',
      shortName: 'GET',
      leagueRank: 14,
      points: 8,
      standingsSource: 'FOOTBALL_DATA_ORG',
      form: ['L', 'D', 'L', 'D', 'L'],
      formSource: 'FOOTBALL_DATA_ORG',
      avgPossession: null,
      avgShotsOnTarget: null,
    },
  });
  const result = evaluateFixturePrediction(fixture, 'none');
  assert.equal(result.predictedWinner, 'home');
  assert.equal(result.hasEvidence, true);
});

test('(3) whenever the pick is draw, drawPct >= max(homeWinPct, awayWinPct)', () => {
  const rankPairs: [number, number][] = [
    [8, 9],
    [5, 8],
    [12, 4],
    [1, 20],
    [10, 10],
  ];

  for (const [homeRank, awayRank] of rankPairs) {
    const fixture = makeBaseFixture({
      homeTeam: {
        id: 'h1',
        name: 'Home Team',
        shortName: 'HOM',
        leagueRank: homeRank,
        points: 20 - homeRank,
        standingsSource: 'FOOTBALL_DATA_ORG',
        form: ['W', 'D', 'L', 'W', 'D'],
        formSource: 'FOOTBALL_DATA_ORG',
        avgPossession: null,
        avgShotsOnTarget: null,
      },
      awayTeam: {
        id: 'a1',
        name: 'Away Team',
        shortName: 'AWA',
        leagueRank: awayRank,
        points: 20 - awayRank,
        standingsSource: 'FOOTBALL_DATA_ORG',
        form: ['D', 'W', 'D', 'L', 'W'],
        formSource: 'FOOTBALL_DATA_ORG',
        avgPossession: null,
        avgShotsOnTarget: null,
      },
    });
    const result = evaluateFixturePrediction(fixture, 'none');
    if (result.predictedWinner === 'draw') {
      const maxWin = Math.max(result.homeWinPct, result.awayWinPct);
      assert.ok(
        result.drawPct >= maxWin,
        `When pick is draw for ranks ${homeRank}/${awayRank}, drawPct (${result.drawPct}%) must be >= max win % (${maxWin}%)`
      );
    }
  }
});

test('(4) manualOverride force_home on an evidence-free fixture still returns home', () => {
  const fixture = makeBaseFixture();
  const result = evaluateFixturePrediction(fixture, 'force_home');
  assert.equal(result.predictedWinner, 'home');
  assert.equal(result.hasEvidence, false);
});

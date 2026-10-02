import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFixturePrediction } from '../src/engine/rulesEngine';

const internationalFixture = {
  id: 'san-marino-u21-vs-spain-u21',
  kickoffTime: '2026-10-02T18:00:00Z',
  league: 'UEFA U21 Qualifying',
  venue: 'San Marino',
  isHighStakes: false,
  motivation: 'regular',
  homeTeam: { id: 'sm-u21', name: 'San Marino U21', shortName: 'SMR', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null },
  awayTeam: { id: 'es-u21', name: 'Spain U21', shortName: 'ESP', leagueRank: null, points: null, form: [], avgPossession: null, avgShotsOnTarget: null },
  h2h: { homeWins: null, draws: null, awayWins: null, totalLast5: null, scoresLast5: [] },
};

test('international fixtures without verified strength do not receive the normal home-advantage prior', () => {
  const prediction = evaluateFixturePrediction(internationalFixture as any);
  assert.ok(prediction.appliedRules.some((r) => r.ruleName === 'Team Data Sufficiency Guard'));
  assert.ok(Math.abs(prediction.homeWinPct - prediction.awayWinPct) < 0.01);
  assert.ok(prediction.homeWinPct < 40);
  assert.ok(prediction.awayWinPct < 40);
});

test('ordinary club fixtures without observed strength also withhold directional home advantage', () => {
  const fixture = { ...internationalFixture, id: 'club-fixture', league: 'Premier League', homeTeam: { ...internationalFixture.homeTeam, name: 'Unknown FC' }, awayTeam: { ...internationalFixture.awayTeam, name: 'Unknown United' } };
  const prediction = evaluateFixturePrediction(fixture as any);
  assert.ok(prediction.appliedRules.some((r) => r.ruleName === 'Team Data Sufficiency Guard'));
  assert.ok(Math.abs(prediction.homeWinPct - prediction.awayWinPct) < 0.01);
});

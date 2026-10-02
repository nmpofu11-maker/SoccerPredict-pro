import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesTeamName, getTeamFormBadgesData } from '../src/utils/formCalculator';
import { HISTORICAL_MATCH_RESULTS } from '../src/data/historical_results';
import { normalizeProviderTeamName } from '../src/services/serverFootballProviderEnrichment';
import type { TeamStats } from '../src/types/soccer';

test('historical team matching requires exact normalized identity', () => {
  assert.equal(matchesTeamName('Manchester City', 'Manchester City'), true);
  assert.equal(matchesTeamName('FC Barcelona', 'Barcelona'), true);
  assert.equal(matchesTeamName('Manchester City', 'Manchester City U21'), false);
  assert.equal(matchesTeamName('City', 'Man City'), false);
});

test('provider normalization does not merge senior and youth teams', () => {
  assert.equal(normalizeProviderTeamName('FC Barcelona'), 'barcelona');
  assert.notEqual(normalizeProviderTeamName('Manchester City'), normalizeProviderTeamName('Manchester City U21'));
});

test('unproven hardcoded historical records are not loaded as training data', () => {
  assert.deepEqual(HISTORICAL_MATCH_RESULTS, []);
});

test('form badges never display W/D/L letters as fabricated full-time scores', () => {
  const team: TeamStats = {
    id: 'test-team',
    name: 'Test FC',
    shortName: 'TST',
    leagueRank: null,
    points: null,
    form: ['W', 'D', 'L'],
    avgPossession: null,
    avgShotsOnTarget: null,
  };
  const badges = getTeamFormBadgesData(team, []);
  assert.deepEqual(badges.map((badge) => badge.result), ['W', 'D', 'L']);
  assert.deepEqual(badges.map((badge) => badge.score), ['', '', '']);
  assert.ok(badges.every((badge) => badge.tooltipTitle.includes('Result:')));
});

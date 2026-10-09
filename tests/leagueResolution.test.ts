import test from 'node:test';
import assert from 'node:assert/strict';
import { getLeagueMeta } from '../src/constants/leagues';

test('an ambiguous bare Serie A label is not assigned to Italy', () => {
  assert.equal(getLeagueMeta('Serie A').country, 'Global');
});

test('explicit Italian Serie A retains the Italian mapping', () => {
  assert.equal(getLeagueMeta('Italian Serie A').country, 'Italy');
  assert.equal(getLeagueMeta('Italy • Serie A').country, 'Italy');
});

test('explicit Brazilian Serie A labels map to Brazil', () => {
  assert.equal(getLeagueMeta('Brazil Serie A').country, 'Brazil');
  assert.equal(getLeagueMeta('Brazilian Serie A').country, 'Brazil');
  assert.equal(getLeagueMeta('Brazil • Serie A').country, 'Brazil');
});

test('an ambiguous bare Serie B label is not assigned to Italy', () => {
  assert.equal(getLeagueMeta('Serie B').country, 'Global');
});

test('Athletico Paranaense vs Atlético-MG must not acquire an Italian country from a bare Serie A label', () => {
  const competition = getLeagueMeta('Serie A');
  assert.equal(competition.country, 'Global');
  assert.notEqual(competition.country, 'Italy');
});

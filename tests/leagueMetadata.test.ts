import test from 'node:test';
import assert from 'node:assert/strict';
import { getLeagueMeta } from '../src/constants/leagues';

test('known competition identity wins over a conflicting provider country prefix', () => {
  const brazil = getLeagueMeta('Italy • Brazilian Serie A');
  assert.equal(brazil.country, 'Brazil');
  assert.equal(brazil.name, 'Brazilian Serie A');
  assert.equal(brazil.flagEmoji, '🇧🇷');

  const italy = getLeagueMeta('Brazil • Italian Serie A');
  assert.equal(italy.country, 'Italy');
  assert.equal(italy.name, 'Italian Serie A');
  assert.equal(italy.flagEmoji, '🇮🇹');
});

test('known competition metadata remains correct without a country prefix', () => {
  assert.equal(getLeagueMeta('Brazilian Serie A').country, 'Brazil');
  assert.equal(getLeagueMeta('Italian Serie A').country, 'Italy');
});

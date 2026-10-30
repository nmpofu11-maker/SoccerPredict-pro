import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyIndependentFixtureSchedule, verifyAndSanitizeFixture } from '../src/services/dataIntegrityValidator';
import type { MatchFixture, FixtureScheduleObservation } from '../src/types/soccer';

const fixture = {
  id: 'fixture-1', kickoffTime: '2026-11-01T15:00:00.000Z', league: 'English Premier League',
  competition: 'English Premier League', homeTeam: { name: 'São Paulo' }, awayTeam: { name: 'Manchester City' },
} as MatchFixture;
const observation = (provider: FixtureScheduleObservation['provider'], overrides: Partial<FixtureScheduleObservation> = {}): FixtureScheduleObservation => ({
  provider, fixtureId: provider.toLowerCase() + '-1', kickoffTime: fixture.kickoffTime,
  homeTeam: 'Sao Paulo FC', awayTeam: 'Manchester City', competition: 'English Premier League', ...overrides,
});

test('two distinct trusted providers corroborate the exact scheduled fixture', () => {
  const result = verifyIndependentFixtureSchedule(fixture, [observation('SPORTAPI_AI'), observation('API_FOOTBALL')]);
  assert.equal(result.verified, true); assert.equal(result.level, 'CORROBORATED');
  assert.deepEqual(result.providers.sort(), ['API_FOOTBALL', 'SPORTAPI_AI']);
});

test('one trusted provider verifies fixture identity at the lower tier', () => {
  const result = verifyIndependentFixtureSchedule(fixture, [observation('SPORTAPI_AI')]);
  assert.equal(result.verified, true); assert.equal(result.level, 'SINGLE_SOURCE');
});

test('duplicate observations from one provider do not count as independent corroboration', () => {
  const result = verifyIndependentFixtureSchedule(fixture, [observation('SPORTAPI_AI'), observation('SPORTAPI_AI', { fixtureId: 'another-id' })]);
  assert.equal(result.level, 'SINGLE_SOURCE'); assert.deepEqual(result.providers, ['SPORTAPI_AI']);
});

test('mismatched teams, competition or kickoff are rejected', () => {
  for (const bad of [
    observation('SPORTAPI_AI', { awayTeam: 'Manchester City U21' }),
    observation('SPORTAPI_AI', { competition: 'English Championship' }),
    observation('SPORTAPI_AI', { kickoffTime: '2026-11-01T18:00:00.000Z' }),
  ]) assert.equal(verifyIndependentFixtureSchedule(fixture, [bad]).level, 'UNVERIFIED');
});

test('untrusted or identifier-free observations cannot verify a fixture', () => {
  assert.equal(verifyIndependentFixtureSchedule(fixture, [observation('SPORTAPI_AI', { fixtureId: '' })]).verified, false);
});

test('standings alone do not authenticate a specific fixture', () => {
  const candidate = { ...fixture, automationSource: 'SPORTAPI_AI', sportApiAiFixtureId: '123', homeTeam: { id: 'h', name: 'São Paulo', leagueRank: 2 }, awayTeam: { id: 'a', name: 'Manchester City', leagueRank: 1 }, h2h: null } as unknown as MatchFixture;
  const result = verifyAndSanitizeFixture(candidate);
  assert.equal(result.stamp.isAuthentic, false);
  assert.equal(result.stamp.status, 'UNVERIFIED');
});

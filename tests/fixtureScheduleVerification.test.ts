import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyIndependentFixtureSchedule } from '../src/services/dataIntegrityValidator';
import type { MatchFixture, FixtureScheduleObservation } from '../src/types/soccer';

const fixture = {
  id: 'merged:fixture-1',
  kickoffTime: '2026-11-01T15:00:00.000Z',
  league: 'English Premier League',
  competition: 'English Premier League',
  homeTeam: { name: 'São Paulo' },
  awayTeam: { name: 'Manchester City' },
} as MatchFixture;

const observation = (
  provider: FixtureScheduleObservation['provider'],
  overrides: Partial<FixtureScheduleObservation> = {},
): FixtureScheduleObservation => ({
  provider,
  fixtureId: `${provider.toLowerCase()}-fixture-1`,
  kickoffTime: fixture.kickoffTime,
  homeTeam: 'Sao Paulo',
  awayTeam: 'Manchester City',
  competition: 'English Premier League',
  ...overrides,
});

test('fixture schedule is verified only when two distinct providers agree on the exact match', () => {
  const result = verifyIndependentFixtureSchedule(fixture, [
    observation('SPORTAPI_AI'),
    observation('API_FOOTBALL'),
  ]);
  assert.equal(result.verified, true);
  assert.deepEqual(result.providers.sort(), ['API_FOOTBALL', 'SPORTAPI_AI']);
});

test('duplicate observations from one provider are not independent corroboration', () => {
  const result = verifyIndependentFixtureSchedule(fixture, [
    observation('SPORTAPI_AI', { fixtureId: 'sportapi-one' }),
    observation('SPORTAPI_AI', { fixtureId: 'sportapi-two' }),
  ]);
  assert.equal(result.verified, false);
});

test('a different kickoff time cannot authenticate the requested fixture', () => {
  const result = verifyIndependentFixtureSchedule(fixture, [
    observation('SPORTAPI_AI'),
    observation('API_FOOTBALL', { kickoffTime: '2026-11-01T18:00:00.000Z' }),
  ]);
  assert.equal(result.verified, false);
});

test('a different team or competition cannot authenticate the requested fixture', () => {
  const wrongTeam = verifyIndependentFixtureSchedule(fixture, [
    observation('SPORTAPI_AI'),
    observation('API_FOOTBALL', { awayTeam: 'Manchester City U21' }),
  ]);
  const wrongCompetition = verifyIndependentFixtureSchedule(fixture, [
    observation('SPORTAPI_AI'),
    observation('API_FOOTBALL', { competition: 'English Championship' }),
  ]);
  assert.equal(wrongTeam.verified, false);
  assert.equal(wrongCompetition.verified, false);
});

test('standings or a single provider observation cannot independently verify schedule authenticity', () => {
  const result = verifyIndependentFixtureSchedule(fixture, [observation('SPORTAPI_AI')]);
  assert.equal(result.verified, false);
  assert.match(result.reason, /two distinct providers/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAndSanitizeFixtures } from '../src/services/dataIntegrityValidator';
import { MatchFixture } from '../src/types/soccer';

const team = (id: string, name: string) => ({
  id,
  name,
  shortName: name.slice(0, 3).toUpperCase(),
  leagueRank: null,
  points: null,
  form: [],
  avgPossession: null,
  avgShotsOnTarget: null,
  isHomeDominant: false,
});

test('verifyAndSanitizeFixtures reconciles inverted team records sharing provider ID', () => {
  const invertedPair: MatchFixture[] = [
    {
      id: 'sportapiai_15325551',
      sportApiAiFixtureId: '15325551',
      kickoffTime: '2026-10-03T06:00:00.000Z',
      league: 'World • Internationals',
      homeTeam: team('sportapiai_team_182752', 'Vanuatu'),
      awayTeam: team('sportapiai_team_182753', 'Fiji'),
      h2h: null,
    } as any,
    {
      id: 'sportapiai_15325551',
      sportApiAiFixtureId: '15325551',
      sportApiAiLeagueId: 71,
      sportApiAiHomeTeamId: 182753,
      sportApiAiAwayTeamId: 182752,
      kickoffTime: '2026-10-03T06:00:00.000Z',
      league: 'World • Internationals',
      homeTeam: team('sportapiai_team_182753', 'Fiji'),
      awayTeam: team('sportapiai_team_182752', 'Vanuatu'),
      h2h: null,
    } as any,
  ];

  const { fixtures } = verifyAndSanitizeFixtures(invertedPair);
  assert.equal(fixtures.length, 1);
  assert.equal(fixtures[0].id, 'sportapiai_15325551');
  assert.equal(fixtures[0].homeTeam.name, 'Fiji');
  assert.equal(fixtures[0].awayTeam.name, 'Vanuatu');
  assert.equal((fixtures[0] as any).sportApiAiHomeTeamId, 182753);
});

test('verifyAndSanitizeFixtures reconciles rescheduled fixture sharing provider ID', () => {
  const rescheduledPair: MatchFixture[] = [
    {
      id: 'sportapiai_13595738',
      sportApiAiFixtureId: '13595738',
      kickoffTime: '2026-10-03T17:00:00.000Z',
      league: 'Nigeria • Nigerian Premier League',
      homeTeam: team('team_doma', 'Doma United'),
      awayTeam: team('team_warri', 'Warri Wolves'),
      h2h: null,
    } as any,
    {
      id: 'sportapiai_13595738',
      sportApiAiFixtureId: '13595738',
      sportApiAiLeagueId: 66,
      sportApiAiHomeTeamId: 3388372,
      sportApiAiAwayTeamId: 24366,
      kickoffTime: '2026-10-04T17:00:00.000Z',
      league: 'Nigeria • Nigerian Premier League',
      homeTeam: team('team_doma', 'Doma United'),
      awayTeam: team('team_warri', 'Warri Wolves'),
      h2h: null,
    } as any,
  ];

  const { fixtures } = verifyAndSanitizeFixtures(rescheduledPair);
  assert.equal(fixtures.length, 1);
  assert.equal(fixtures[0].id, 'sportapiai_13595738');
  assert.equal(fixtures[0].kickoffTime, '2026-10-04T17:00:00.000Z');
  assert.equal((fixtures[0] as any).sportApiAiLeagueId, 66);
});

test('verifyAndSanitizeFixtures disambiguates colliding IDs for genuinely distinct teams', () => {
  const collidingPair: MatchFixture[] = [
    {
      id: 'shared_id_100',
      kickoffTime: '2026-10-03T15:00:00.000Z',
      league: 'League A',
      homeTeam: team('team_a', 'Team Alpha'),
      awayTeam: team('team_b', 'Team Beta'),
      h2h: null,
    } as any,
    {
      id: 'shared_id_100',
      kickoffTime: '2026-10-03T18:00:00.000Z',
      league: 'League B',
      homeTeam: team('team_c', 'Team Gamma'),
      awayTeam: team('team_d', 'Team Delta'),
      h2h: null,
    } as any,
  ];

  const { fixtures } = verifyAndSanitizeFixtures(collidingPair);
  assert.equal(fixtures.length, 2);
  assert.notEqual(fixtures[0].id, fixtures[1].id);
  assert.equal(fixtures[0].homeTeam.name, 'Team Alpha');
  assert.equal(fixtures[1].homeTeam.name, 'Team Gamma');
});


test('keeps same-named teams in different competitions separate', () => {
  const fixtures: MatchFixture[] = [
    {
      id: 'fixture_mens',
      kickoffTime: '2026-10-25T15:00:00.000Z',
      league: 'English Premier League',
      competition: 'English Premier League',
      homeTeam: team('mens_home', 'Manchester United'),
      awayTeam: team('mens_away', 'Manchester City'),
      h2h: null,
    } as any,
    {
      id: 'fixture_womens',
      kickoffTime: '2026-10-25T15:00:00.000Z',
      league: 'English Womens Super League',
      competition: 'English Womens Super League',
      homeTeam: team('womens_home', 'Manchester United'),
      awayTeam: team('womens_away', 'Manchester City'),
      h2h: null,
    } as any,
  ];

  const { fixtures: result } = verifyAndSanitizeFixtures(fixtures);
  assert.equal(result.length, 2);
  assert.ok(result.some((f) => f.id === 'fixture_mens'));
  assert.ok(result.some((f) => f.id === 'fixture_womens'));
});

test('does not merge a shared provider fixture ID across competitions', () => {
  const fixtures: MatchFixture[] = [
    {
      id: 'shared_provider_id',
      sportApiAiFixtureId: 'shared_provider_id',
      kickoffTime: '2026-10-25T15:00:00.000Z',
      league: 'English Premier League',
      homeTeam: team('mens_home', 'Manchester United'),
      awayTeam: team('mens_away', 'Manchester City'),
      h2h: null,
    } as any,
    {
      id: 'shared_provider_id',
      sportApiAiFixtureId: 'shared_provider_id',
      kickoffTime: '2026-10-25T15:00:00.000Z',
      league: 'English Womens Super League',
      homeTeam: team('womens_home', 'Manchester United'),
      awayTeam: team('womens_away', 'Manchester City'),
      h2h: null,
    } as any,
  ];

  const { fixtures: result } = verifyAndSanitizeFixtures(fixtures);
  assert.equal(result.length, 2);
  assert.notEqual(result[0].id, result[1].id);
});

test('verifyAndSanitizeFixtures keeps provider namespaces distinct', () => {
  const fixtures: MatchFixture[] = [
    {
      id: 'fixture_a',
      sportApiAiFixtureId: '12345',
      kickoffTime: '2026-10-03T15:00:00.000Z',
      league: 'League A',
      homeTeam: team('team_a', 'Team Alpha'),
      awayTeam: team('team_b', 'Team Beta'),
      h2h: null,
    } as any,
    {
      id: 'fixture_b',
      pitchApiMatchId: '12345',
      kickoffTime: '2026-10-03T15:00:00.000Z',
      league: 'League B',
      homeTeam: team('team_c', 'Team Gamma'),
      awayTeam: team('team_d', 'Team Delta'),
      h2h: null,
    } as any,
  ];

  const { fixtures: result } = verifyAndSanitizeFixtures(fixtures);
  assert.equal(result.length, 2);
  assert.equal((result[0] as any).sportApiAiFixtureId, '12345');
  assert.equal((result[1] as any).pitchApiMatchId, '12345');
});

const evidenceTeam = (id: string, name: string) => ({
  ...team(id, name),
  form: ['W', 'D', 'W'] as ('W' | 'D' | 'L')[],
  formSource: 'SPORTAPI_AI',
});

test('preserves evidence-bearing same-date duplicate over a weaker record', () => {
  const fixtures: MatchFixture[] = [
    {
      id: 'fixture_evidence',
      kickoffTime: '2026-10-24T15:00:00.000Z',
      league: 'Test League',
      homeTeam: evidenceTeam('home', 'Team Alpha'),
      awayTeam: evidenceTeam('away', 'Team Beta'),
      h2h: null,
    } as any,
    {
      id: 'fixture_weaker',
      kickoffTime: '2026-10-24T18:00:00.000Z',
      league: 'Test League',
      homeTeam: team('home', 'Team Alpha'),
      awayTeam: team('away', 'Team Beta'),
      h2h: null,
    } as any,
  ];

  const { fixtures: result } = verifyAndSanitizeFixtures(fixtures);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'fixture_evidence');
  assert.deepEqual(result[0].homeTeam.form, ['W', 'D', 'W']);
  assert.deepEqual(result[0].awayTeam.form, ['W', 'D', 'W']);
});

test('preserves verified evidence when a weaker provider record reports a reschedule', () => {
  const fixtures: MatchFixture[] = [
    {
      id: 'sportapiai_shared42',
      sportApiAiFixtureId: 'shared42',
      kickoffTime: '2026-10-24T15:00:00.000Z',
      league: 'Test League',
      homeTeam: evidenceTeam('home', 'Team Alpha'),
      awayTeam: evidenceTeam('away', 'Team Beta'),
      h2h: null,
    } as any,
    {
      id: 'sportapiai_shared42',
      sportApiAiFixtureId: 'shared42',
      kickoffTime: '2026-10-25T15:00:00.000Z',
      league: 'Test League',
      homeTeam: team('home', 'Team Alpha'),
      awayTeam: team('away', 'Team Beta'),
      h2h: null,
    } as any,
  ];

  const { fixtures: result } = verifyAndSanitizeFixtures(fixtures);

  assert.equal(result.length, 1);
  assert.equal(result[0].kickoffTime, '2026-10-24T15:00:00.000Z');
  assert.deepEqual(result[0].homeTeam.form, ['W', 'D', 'W']);
  assert.deepEqual(result[0].awayTeam.form, ['W', 'D', 'W']);
});

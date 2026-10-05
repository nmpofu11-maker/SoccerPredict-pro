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

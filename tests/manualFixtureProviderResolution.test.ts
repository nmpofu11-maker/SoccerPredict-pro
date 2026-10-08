import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHollywoodbetsRawText } from '../src/services/hollywoodbetsParser';
import {
  areCompetitionsCompatible,
  canonicalizeProviderCompetitionName,
  findUniqueMatchingCandidate,
  providerTeamNameSimilarity,
} from '../src/services/serverFootballProviderEnrichment';

const baseFixture = {
  id: 'hollywoodbets_test',
  kickoffTime: '2026-10-08T18:00:00+02:00',
  league: 'South Africa • Betway Premiership',
  competition: 'South Africa • Betway Premiership',
  homeTeam: { id: 'tm_home', name: 'Kaizer Chiefs' },
  awayTeam: { id: 'tm_away', name: 'Orlando Pirates' },
} as any;

test('canonicalizes known South African bookmaker competition labels', () => {
  assert.equal(
    canonicalizeProviderCompetitionName('South Africa • Betway Premiership'),
    'south african premiership',
  );
  assert.equal(
    canonicalizeProviderCompetitionName('DSTV Premiership'),
    'south african premiership',
  );
  assert.equal(
    canonicalizeProviderCompetitionName('South African First Division'),
    'south african first division',
  );
});

test('accepts a bookmaker-prefixed Premiership when provider reports Premier Soccer League', () => {
  assert.equal(
    areCompetitionsCompatible(
      'South Africa • Betway Premiership',
      'South Africa • Betway Premiership',
      'Premier Soccer League',
      'South Africa',
    ),
    true,
  );
});

test('does not collapse unrelated South African competitions into the Premiership', () => {
  assert.equal(
    areCompetitionsCompatible(
      'South Africa • Betway Premiership',
      'South Africa • Betway Premiership',
      'South African First Division',
      'South Africa',
    ),
    false,
  );
});

test('resolves a manual fixture only when team, kickoff and competition identity all agree', () => {
  const raw = {
    id: 9001,
    datetime: '2026-10-08T16:00:00Z',
    league: { id: 123, name: 'Premier Soccer League', country: 'South Africa' },
    home_team: { id: 11, name: 'Kaizer Chiefs' },
    away_team: { id: 22, name: 'Orlando Pirates' },
  };
  const mapped = {
    id: 'sportapiai_9001',
    kickoffTime: raw.datetime,
    league: raw.league.name,
    competition: raw.league.name,
    homeTeam: { id: 'sportApiAi_11', name: 'Kaizer Chiefs' },
    awayTeam: { id: 'sportApiAi_22', name: 'Orlando Pirates' },
  } as any;

  const resolved = findUniqueMatchingCandidate(baseFixture, [{ raw, mapped }]);
  assert.ok(resolved);
  assert.equal(resolved?.raw.id, 9001);

  const wrongCompetition = {
    ...raw,
    league: { ...raw.league, name: 'South African First Division' },
  };
  assert.equal(
    findUniqueMatchingCandidate(baseFixture, [{ raw: wrongCompetition, mapped: { ...mapped, competition: wrongCompetition.league.name } as any }]),
    null,
  );
});

test('manual bookmaker parsing does not invent venue, round or H2H history', () => {
  const fixtures = parseHollywoodbetsRawText(
    'South Africa\nKaizer Chiefs vs Orlando Pirates\nSouth Africa • Betway Premiership\n18:00'
  );
  assert.equal(fixtures.length, 1);
  assert.equal(fixtures[0].venue, '');
  assert.equal(fixtures[0].round, undefined);
  assert.equal(fixtures[0].h2h?.totalLast5, null);
  assert.deepEqual(fixtures[0].h2h?.scoresLast5, []);
});


test('canonicalizes common international provider competition naming variants', () => {
  assert.equal(canonicalizeProviderCompetitionName('LigaPro Primera B'), 'ecuador ligapro serie b');
  assert.equal(canonicalizeProviderCompetitionName('LigaPro Serie B'), 'ecuador ligapro serie b');
  assert.equal(canonicalizeProviderCompetitionName('Romanian Liga I'), 'romanian liga i');
  assert.equal(canonicalizeProviderCompetitionName('Liga I'), 'romanian liga i');
  assert.equal(canonicalizeProviderCompetitionName('Iraq Stars League'), 'iraq stars league');
  assert.equal(canonicalizeProviderCompetitionName('Stars League'), 'iraq stars league');
});

test('accepts supported provider competition aliases without weakening unrelated competition identity', () => {
  assert.equal(areCompetitionsCompatible('LigaPro Primera B', undefined, 'LigaPro Serie B'), true);
  assert.equal(areCompetitionsCompatible('Romanian Liga I', undefined, 'Liga I'), true);
  assert.equal(areCompetitionsCompatible('Stars League', undefined, 'Iraq Stars League'), true);
  assert.equal(areCompetitionsCompatible('LigaPro Primera B', undefined, 'LigaPro Primera A'), false);
  assert.equal(areCompetitionsCompatible('Romanian Liga I', undefined, 'Romanian Liga II'), false);
});


test('scores safe Sportmonks team-name variants without accepting weak matches', () => {
  assert.ok(providerTeamNameSimilarity('Independiente Medellín', 'Independiente Medellin') >= 0.99);
  assert.ok(providerTeamNameSimilarity('Independiente Santa Fe', 'Independiente Santa Fe') === 1);
  assert.ok(providerTeamNameSimilarity('Rosario Central', 'Club Atlético Rosario Central') >= 0.75);
  assert.ok(providerTeamNameSimilarity('Banfield', 'Barcelona') < 0.75);
});

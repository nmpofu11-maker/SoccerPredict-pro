import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findSafeSettlementNameMatch,
  isSettlementTeamIdentityMatch,
  providerSettlementKickoffMs,
  resolveVerifiedSettlementMatch,
} from '../src/utils/settlementMatching';

const fixture = {
  kickoffTime: '2026-10-09T14:30:00.000Z',
  homeTeam: { name: 'Arsenal FC', shortName: 'ARS' },
  awayTeam: { name: 'Chelsea FC', shortName: 'CHE' },
};

test('settlement fallback requires an explicit provider kickoff within three hours', () => {
  const good = { id: 'good', starting_at: '2026-10-09T15:00:00.000Z' };
  const exactThreeHours = { id: 'edge', starting_at: '2026-10-09T17:30:00.000Z' };
  const overThreeHours = { id: 'drift-3h01m', starting_at: '2026-10-09T17:31:00.000Z' };

  assert.equal(findSafeSettlementNameMatch([good], fixture), good);
  assert.equal(findSafeSettlementNameMatch([exactThreeHours], fixture), exactThreeHours);
  assert.equal(findSafeSettlementNameMatch([overThreeHours], fixture), undefined);
  assert.equal(findSafeSettlementNameMatch([{ id: 'no-time' }], fixture), undefined);
  assert.equal(findSafeSettlementNameMatch([{ id: 'too-far', date: '2026-10-10T15:00:00.000Z' }], fixture), undefined);
});

test('settlement fallback refuses ambiguous same-team candidates', () => {
  const a = { id: 'a', date: '2026-10-09T14:30:00.000Z' };
  const b = { id: 'b', date: '2026-10-09T15:15:00.000Z' };
  assert.equal(findSafeSettlementNameMatch([a, b], fixture), undefined);
  assert.equal(findSafeSettlementNameMatch([], fixture), undefined);
});

test('provider kickoff extraction supports Sportmonks, PitchAPI, Football-Data, TheRundown, SportAPI.ai, and API-Football fields', () => {
  assert.equal(
    providerSettlementKickoffMs({ commence_time: '2026-10-09T14:30:00Z' }),
    Date.parse('2026-10-09T14:30:00Z')
  );
  assert.equal(
    providerSettlementKickoffMs({ event_date: '2026-10-09T14:30:00Z' }),
    Date.parse('2026-10-09T14:30:00Z')
  );
  assert.equal(
    providerSettlementKickoffMs({ time_utc: '2026-10-09T14:30:00Z' }),
    Date.parse('2026-10-09T14:30:00Z')
  );
  assert.equal(
    providerSettlementKickoffMs({ utcDate: '2026-10-09T14:30:00Z' }),
    Date.parse('2026-10-09T14:30:00Z')
  );
  assert.equal(
    providerSettlementKickoffMs({ starting_at: '2026-10-09 14:30:00' }),
    Date.parse('2026-10-09T14:30:00Z')
  );
  assert.equal(
    providerSettlementKickoffMs({ fixture: { date: '2026-10-09T14:30:00Z' } }),
    Date.parse('2026-10-09T14:30:00Z')
  );
  assert.ok(Number.isNaN(providerSettlementKickoffMs({ date: '2026-10-09' })));
});

test('Requirement C: resolveVerifiedSettlementMatch accepts valid candidate within 3h across Sportmonks, PitchAPI, and Football-Data shapes', () => {
  // Sportmonks candidate
  const sportmonksCandidate = {
    id: 991,
    starting_at: '2026-10-09 15:00:00',
    participants: [
      { name: 'Arsenal FC', meta: { location: 'home' } },
      { name: 'Chelsea FC', meta: { location: 'away' } },
    ],
  };
  assert.equal(
    resolveVerifiedSettlementMatch({
      nameCandidates: [sportmonksCandidate],
      fixture,
      extractTeams: (m) => ({
        home: m.participants.find((p) => p.meta.location === 'home')?.name,
        away: m.participants.find((p) => p.meta.location === 'away')?.name,
      }),
    }),
    sportmonksCandidate
  );

  // PitchAPI candidate (`time_utc`)
  const pitchCandidate = {
    id: 'm_pitch_1',
    time_utc: '2026-10-09T16:00:00Z',
    home_team: { name: 'Arsenal FC' },
    away_team: { name: 'Chelsea FC' },
  };
  assert.equal(
    resolveVerifiedSettlementMatch({
      nameCandidates: [pitchCandidate],
      fixture,
      extractTeams: (m) => ({ home: m.home_team.name, away: m.away_team.name }),
    }),
    pitchCandidate
  );

  // Football-Data.org candidate (`utcDate` + `name` / `shortName`)
  const footballDataCandidate = {
    id: 4001,
    utcDate: '2026-10-09T14:30:00Z',
    homeTeam: { name: 'Arsenal FC', shortName: 'Arsenal' },
    awayTeam: { name: 'Chelsea FC', shortName: 'Chelsea' },
  };
  assert.equal(
    resolveVerifiedSettlementMatch({
      nameCandidates: [footballDataCandidate],
      fixture,
      expectedDate: '2026-10-09',
      extractTeams: (m) => ({
        home: [m.homeTeam.name, m.homeTeam.shortName],
        away: [m.awayTeam.name, m.awayTeam.shortName],
      }),
    }),
    footballDataCandidate
  );
});

test('Requirement C: resolveVerifiedSettlementMatch rejects >3h kickoff drift and ambiguous same-team candidates', () => {
  const driftedPitch = {
    id: 'm_pitch_late',
    time_utc: '2026-10-09T19:00:00Z', // 4.5h after 14:30Z
    home_team: { name: 'Arsenal FC' },
    away_team: { name: 'Chelsea FC' },
  };
  assert.equal(
    resolveVerifiedSettlementMatch({
      nameCandidates: [driftedPitch],
      fixture,
      extractTeams: (m) => ({ home: m.home_team.name, away: m.away_team.name }),
    }),
    undefined
  );

  const smDuplicateA = {
    id: 101,
    starting_at: '2026-10-09 14:30:00',
    home: 'Arsenal FC',
    away: 'Chelsea FC',
  };
  const smDuplicateB = {
    id: 102,
    starting_at: '2026-10-09 16:00:00',
    home: 'Arsenal FC',
    away: 'Chelsea FC',
  };
  assert.equal(
    resolveVerifiedSettlementMatch({
      nameCandidates: [smDuplicateA, smDuplicateB],
      fixture,
      extractTeams: (m) => ({ home: m.home, away: m.away }),
    }),
    undefined
  );
});

test('Requirement C: resolveVerifiedSettlementMatch rejects mismatched or inverted team identity on both ID lookup and name fallback', () => {
  const wrongTeamsSameId = {
    id: 'colliding_id_77',
    time_utc: '2026-10-09T14:30:00Z',
    home_team: { name: 'Liverpool FC' },
    away_team: { name: 'Everton FC' },
  };

  assert.equal(
    resolveVerifiedSettlementMatch({
      idMatch: wrongTeamsSameId,
      nameCandidates: [wrongTeamsSameId],
      fixture,
      extractTeams: (m) => ({ home: m.home_team.name, away: m.away_team.name }),
    }),
    undefined
  );

  // Inverted home/away teams must also be rejected
  const invertedTeamsSameId = {
    id: 'colliding_id_77',
    time_utc: '2026-10-09T14:30:00Z',
    home_team: { name: 'Chelsea FC' },
    away_team: { name: 'Arsenal FC' },
  };

  assert.equal(
    isSettlementTeamIdentityMatch(
      invertedTeamsSameId.home_team.name,
      invertedTeamsSameId.away_team.name,
      fixture.homeTeam.name,
      fixture.awayTeam.name
    ),
    false
  );
    assert.equal(
      resolveVerifiedSettlementMatch({
        idMatch: invertedTeamsSameId,
        nameCandidates: [invertedTeamsSameId],
        fixture,
        extractTeams: (m) => ({ home: m.home_team.name, away: m.away_team.name }),
      }),
      undefined
    );
  });

test('Direct ID match rejects same teams playing on different dates with a reused or colliding ID', () => {
  // Target fixture is 2026-10-09T14:30:00.000Z (Arsenal FC vs Chelsea FC).
  // Reused/composite provider ID points to a cup rematch 19 days later (2026-10-28)
  // and another rematch the very next day (2026-10-10).
  const cupRematchCollidingId = {
    id: 'arsenalfc_chelseafc',
    kickoff_utc: '2026-10-28 19:45:00',
    home_team: { name: 'Arsenal FC' },
    away_team: { name: 'Chelsea FC' },
  };
  const nextDayRematchCollidingId = {
    id: 'arsenalfc_chelseafc',
    time_utc: '2026-10-10T14:30:00Z',
    home_team: { name: 'Arsenal FC' },
    away_team: { name: 'Chelsea FC' },
  };

  // Rejected when expectedDate is omitted (3-hour kickoff window still blocks other dates)
  assert.equal(
    resolveVerifiedSettlementMatch({
      idMatch: cupRematchCollidingId,
      fixture,
      extractTeams: (m) => ({ home: m.home_team.name, away: m.away_team.name }),
    }),
    undefined
  );
  assert.equal(
    resolveVerifiedSettlementMatch({
      idMatch: nextDayRematchCollidingId,
      fixture,
      extractTeams: (m) => ({ home: m.home_team.name, away: m.away_team.name }),
    }),
    undefined
  );

  // Rejected when expectedDate is explicitly provided
  assert.equal(
    resolveVerifiedSettlementMatch({
      idMatch: cupRematchCollidingId,
      expectedDate: '2026-10-09',
      fixture,
      extractTeams: (m) => ({ home: m.home_team.name, away: m.away_team.name }),
    }),
    undefined
  );

  // If idMatch collides with a different-date rematch, resolver rejects idMatch
  // and safely falls back to the genuine target-date match within 3 hours.
  const genuineTargetDateMatch = {
    id: '998877',
    kickoff_utc: '2026-10-09 14:30:00',
    home_team: { name: 'Arsenal FC' },
    away_team: { name: 'Chelsea FC' },
  };
  assert.equal(
    resolveVerifiedSettlementMatch({
      idMatch: cupRematchCollidingId,
      nameCandidates: [cupRematchCollidingId, genuineTargetDateMatch],
      expectedDate: '2026-10-09',
      fixture,
      extractTeams: (m) => ({ home: m.home_team.name, away: m.away_team.name }),
    }),
    genuineTargetDateMatch
  );
});

test('Direct ID match enforces three-hour kickoff tolerance and explicit timestamp', () => {
  const validDirectIdMatch = {
    id: '7701',
    starting_at: '2026-10-09 15:00:00', // +30m within 3h window
    home_team: { name: 'Arsenal FC' },
    away_team: { name: 'Chelsea FC' },
  };
  const driftedDirectIdMatch = {
    id: '7701',
    starting_at: '2026-10-09 17:31:00', // +3h 01m > 3h window
    home_team: { name: 'Arsenal FC' },
    away_team: { name: 'Chelsea FC' },
  };
  const undatedDirectIdMatch = {
    id: '7701',
    date: '2026-10-09', // date-only without kickoff time
    home_team: { name: 'Arsenal FC' },
    away_team: { name: 'Chelsea FC' },
  };

  assert.equal(
    resolveVerifiedSettlementMatch({
      idMatch: validDirectIdMatch,
      fixture,
      extractTeams: (m) => ({ home: m.home_team.name, away: m.away_team.name }),
    }),
    validDirectIdMatch
  );
  assert.equal(
    resolveVerifiedSettlementMatch({
      idMatch: driftedDirectIdMatch,
      fixture,
      extractTeams: (m) => ({ home: m.home_team.name, away: m.away_team.name }),
    }),
    undefined
  );
  assert.equal(
    resolveVerifiedSettlementMatch({
      idMatch: undatedDirectIdMatch,
      fixture,
      extractTeams: (m) => ({ home: m.home_team.name, away: m.away_team.name }),
    }),
    undefined
  );
});

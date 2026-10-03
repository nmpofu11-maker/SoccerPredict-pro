    assert.equal(out.homeTeam.leagueRank, 2);
    assert.equal(out.awayTeam.leagueRank, 5);
    assert.deepEqual(out.homeTeam.form, ['W','W','D','L','W']);
    assert.equal(out.homeTeam.formSource, 'SPORTAPI_AI');
    assert.equal(out.homeTeam.avgPossession, 55.3);
    assert.equal(out.homeTeam.avgShotsOnTarget, 5.7);
    assert.equal(out.homeTeam.matchStatsSource, 'SPORTAPI_AI');
    assert.equal(out.awayTeam.avgPossession, 49.3);
    assert.equal(out.awayTeam.avgShotsOnTarget, 4.7);
    assert.equal(out.awayTeam.matchStatsSource, 'SPORTAPI_AI');
    assert.equal(out.h2h?.source, 'SPORTAPI_AI');
    assert.equal(out.h2h?.homeWins, 2);
    assert.equal(out.h2h?.draws, 1);
    assert.equal(out.h2h?.awayWins, 0);
  } finally {
    restoreEnvironment();
    delete process.env.SPORT_PROVIDER_MAX_TEAM_LOOKUPS;
    delete process.env.SPORT_PROVIDER_MAX_H2H_LOOKUPS;
    delete process.env.SPORT_PROVIDER_MAX_MATCH_STAT_LOOKUPS;
  }
});

test('Sportmonks supplies verified form, standings, possession, shots-on-target and xG from participant-linked matches', async () => {
  delete process.env.API_FOOTBALL_USE_RAPIDAPI;
  delete process.env.SPORTAPI_AI_KEY;
  process.env.SPORTMONKS_API_KEY = 'test-sportmonks-key';
  process.env.SPORT_PROVIDER_MAX_TEAM_LOOKUPS = '4';
  process.env.SPORT_PROVIDER_MAX_H2H_LOOKUPS = '4';

  const makeSmMatch = (id: number, date: string, homeId: number, awayId: number, hg: number, ag: number, hp: number, ap: number, hs: number, as: number, hxg: number, axg: number) => ({
    id,
    starting_at: date,
    state: { short_name: 'FT' },
    participants: [
      { id: homeId, name: homeId === 101 ? 'Home FC' : 'Opponent ' + homeId, meta: { location: 'home' } },
      { id: awayId, name: awayId === 202 ? 'Away FC' : 'Opponent ' + awayId, meta: { location: 'away' } },
    ],
    scores: {
      data: [
        { description: 'CURRENT', score: { participant: 'home', goals: hg } },
        { description: 'CURRENT', score: { participant: 'away', goals: ag } },
      ],
    },
    statistics: {
      data: [
        { participant_id: homeId, type: { id: 45, code: 'BALL_POSSESSION' }, data: { value: hp } },
        { participant_id: awayId, type: { id: 45, code: 'BALL_POSSESSION' }, data: { value: ap } },
        { participant_id: homeId, type: { id: 86, code: 'SHOTS_ON_TARGET' }, data: { value: hs } },
        { participant_id: awayId, type: { id: 86, code: 'SHOTS_ON_TARGET' }, data: { value: as } },
      ],
    },
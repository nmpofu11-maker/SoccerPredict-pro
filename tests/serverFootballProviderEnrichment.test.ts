    const result = await enrichFixturesWithFootballApis([fixture], ['2026-10-10'], { enableApiFootball: false, enableSportmonks: false });
    const out = result.fixtures[0];
    assert.equal(out.homeTeam.leagueRank, 2);
    assert.equal(out.awayTeam.leagueRank, 5);
    assert.deepEqual(out.homeTeam.form, ['W','W','D','L','W']);
    assert.equal(out.homeTeam.formSource, 'SPORTAPI_AI');
    assert.equal(out.homeTeam.avgPossession, 56.7);
    assert.equal(out.homeTeam.avgShotsOnTarget, 5.7);
    assert.equal(out.homeTeam.matchStatsSource, 'SPORTAPI_AI');
    assert.equal(out.awayTeam.avgPossession, 43.3);
    assert.equal(out.awayTeam.avgShotsOnTarget, 3);
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
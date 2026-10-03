      if (existing) {
        Object.assign(existing, {
          sportmonksFixtureId: (mapped as any).sportmonksFixtureId,
          sportmonksLeagueId: (mapped as any).sportmonksLeagueId,
          sportMonksSeasonId: (mapped as any).sportMonksSeasonId,
          sportmonksHomeTeamId: (mapped as any).sportmonksHomeTeamId,
          sportmonksAwayTeamId: (mapped as any).sportmonksAwayTeamId,
        });
      }
    }
  }

  const sportApiTeamBudget = { used: 0 };
  const sportApiStatBudget = { used: 0 };
  const sportApiH2HBudget = { used: 0 };
  const sportmonksTeamBudget = { used: 0 };
  const sportmonksH2HBudget = { used: 0 };
  const sportmonksTeamSearchBudget = { used: 0 };

  async function enrichFromSportApi(fixture: MatchFixture): Promise<void> {
    if (!sportApiAiEnabled || !sportApiAiConfigured()) return;
    const homeId = Number((fixture as any).sportApiAiHomeTeamId);
    const awayId = Number((fixture as any).sportApiAiAwayTeamId);
    const leagueId = Number((fixture as any).sportApiAiLeagueId);
    if (!Number.isInteger(homeId) || !Number.isInteger(awayId)) return;

    if (Number.isInteger(leagueId)) {
      try {
        const standings = await getSportApiStandings(String(leagueId));
        for (const entry of [[fixture.homeTeam, homeId], [fixture.awayTeam, awayId]] as const) {
          const team = entry[0];
          const id = entry[1];
          const standing = findProviderStanding(standings, String(id), team.name);
          if (standing) {
            if (!(team.standingsSource && Number.isFinite(team.leagueRank))) {
              team.leagueRank = standing.rank;
              team.points = standing.points;
              team.standingsSource = 'SPORTAPI_AI';
            }
            if (!(team.formSource && team.form.length) && standing.form?.length) {
              team.form = standing.form.slice(-5);
              team.formSource = 'SPORTAPI_AI';
            }
          }
        }
      } catch (err) {
        errors.push('SportAPI.ai standings ' + leagueId + ': ' + (err instanceof Error ? err.message : String(err)));
      }
    }

    // SportAPI.ai enrichment must use SportAPI.ai team IDs. Do not substitute
    // Sportmonks IDs here; the two providers maintain independent entity namespaces.
    const sportApiEntries: Array<[TeamStats, number]> = [
      [fixture.homeTeam, homeId],
      [fixture.awayTeam, awayId],
    ];

    for (const entry of sportApiEntries) {
      const team = entry[0];
      const id = entry[1];
      if (sportApiTeamBudget.used >= providerLimit('SPORT_PROVIDER_MAX_TEAM_LOOKUPS', DEFAULT_TEAM_LOOKUP_LIMIT)) break;
      sportApiTeamBudget.used++;
      try {
        const body = await getSportApiTeam(String(id));
        const matches = extractSportApiTeamMatches(body);
        const formPatch = summarizeFormFromMatches(team.name, String(id), matches, fixture.kickoffTime, 'SPORTAPI_AI');
        if (!(team.formSource && team.form.length) && formPatch.form?.length) Object.assign(team, formPatch);
        team.scheduleSource = 'SPORTAPI_AI';

        if (!team.homeAwayFormSource) {
          const homeMatches = matches.filter((m) => completedProviderMatch(m, fixture.kickoffTime) && teamSideForFixture(m, String(id), team.name) === 'home');
          const awayMatches = matches.filter((m) => completedProviderMatch(m, fixture.kickoffTime) && teamSideForFixture(m, String(id), team.name) === 'away');
          if (homeMatches.length >= 3) {
            const homeForm = summarizeFormFromMatches(team.name, String(id), homeMatches.slice(-5), fixture.kickoffTime, 'SPORTAPI_AI').form || [];
            const ppg = homeForm.length ? homeForm.reduce((sum, r) => sum + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0) / homeForm.length : 0;
            team.isHomeDominant = ppg >= 2.0;
            team.homeAwayFormSource = 'SPORTAPI_AI';
          }
          if (awayMatches.length >= 3) {
            const awayForm = summarizeFormFromMatches(team.name, String(id), awayMatches.slice(-5), fixture.kickoffTime, 'SPORTAPI_AI').form || [];
            const ppg = awayForm.length ? awayForm.reduce((sum, r) => sum + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0) / awayForm.length : 0;
            team.hasTopTierAwayForm = ppg >= 2.0;
            team.homeAwayFormSource = 'SPORTAPI_AI';
          }
        }

        const recent = matches
          .filter((m) => completedProviderMatch(m, fixture.kickoffTime))
          .sort((a, b) => Date.parse(String(a.datetime || a.utc_date || a.starting_at || a.date || '')) -
            Date.parse(String(b.datetime || b.utc_date || b.starting_at || b.date || '')))
          .slice(-5);

        const possessionValues: number[] = [];
        const shotsValues: number[] = [];
        for (const match of recent) {
          const fixtureId = match?.id ?? match?.fixture_id;
          if (fixtureId === undefined) continue;
          if (sportApiStatBudget.used >= providerLimit('SPORT_PROVIDER_MAX_MATCH_STAT_LOOKUPS', DEFAULT_MATCH_STAT_LOOKUP_LIMIT)) break;
          sportApiStatBudget.used++;
          try {
            const stats = await getSportApiFixtureStats(String(fixtureId));
            const side = teamSideForFixture(match, String(id), team.name);
            const block = side === 'home' ? (stats?.data?.home ?? stats?.home)
              : side === 'away' ? (stats?.data?.away ?? stats?.away) : null;
            if (!block) continue;
            const possession = finiteNumber(block.possession ?? block.ball_possession ?? block.possession_pct);
            const shots = finiteNumber(block.shots_on_target ?? block.shotsOnTarget);
            if (possession !== null && possession >= 0 && possession <= 100) possessionValues.push(possession);
            if (shots !== null && shots >= 0 && shots <= 20) shotsValues.push(shots);
          } catch (err) {
            errors.push('SportAPI.ai match stats ' + fixtureId + ': ' + (err instanceof Error ? err.message : String(err)));
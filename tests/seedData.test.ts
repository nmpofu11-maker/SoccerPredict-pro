import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = path.join(root, 'src', 'data', 'upcoming_fixtures.json');

test('committed seed fixtures contain no fabricated statistics or fake verification labels', () => {
  assert.ok(fs.existsSync(seedPath), 'Seed fixtures file must exist');
  const fixtures = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  assert.ok(Array.isArray(fixtures), 'Seed fixtures must be an array');
  assert.ok(fixtures.length > 0, 'Seed fixtures array must not be empty');

  for (const f of fixtures) {
    // Assert neither team has non-null rank, points, possession, shots, squad values, ratings, or non-empty form
    for (const side of ['homeTeam', 'awayTeam'] as const) {
      const team = f[side];
      assert.ok(team, `Fixture ${f.id} must have ${side}`);

      if (!team.standingsSource) {
        assert.equal(team.leagueRank, null, `Fixture ${f.id} ${side}.leagueRank must be null when unverified`);
        assert.equal(team.points, null, `Fixture ${f.id} ${side}.points must be null when unverified`);
      } else {
        assert.ok(
          ['SPORTAPI_AI', 'SPORTMONKS', 'FOOTBALL_DATA_ORG', 'API_FOOTBALL', 'ESPN'].includes(team.standingsSource),
          `Fixture ${f.id} ${side}.standingsSource must be a recognized provider`
        );
      }

      if (!team.formSource) {
        assert.equal(team.form.length, 0, `Fixture ${f.id} ${side}.form must be empty when unverified`);
      } else {
        assert.ok(
          ['SPORTAPI_AI', 'SPORTMONKS', 'FOOTBALL_DATA_ORG', 'API_FOOTBALL', 'ESPN'].includes(team.formSource),
          `Fixture ${f.id} ${side}.formSource must be a recognized provider`
        );
      }

      if (!team.matchStatsSource) {
        assert.equal(team.avgPossession, null, `Fixture ${f.id} ${side}.avgPossession must be null when unverified`);
        assert.equal(team.avgShotsOnTarget, null, `Fixture ${f.id} ${side}.avgShotsOnTarget must be null when unverified`);
      }

      if (!team.homeAwayFormSource) {
        assert.equal(team.isHomeDominant ?? false, false, `Fixture ${f.id} ${side}.isHomeDominant must be false when unverified`);
        assert.equal(team.hasTopTierAwayForm ?? false, false, `Fixture ${f.id} ${side}.hasTopTierAwayForm must be false when unverified`);
      }

      if ('expectedGoalsAvg' in team && team.expectedGoalsAvg !== undefined && !team.advancedStatsSource) {
        assert.equal(team.expectedGoalsAvg, null, `Fixture ${f.id} ${side}.expectedGoalsAvg must be null when unverified`);
      }
      if ('totalSquadValueEur' in team && team.totalSquadValueEur !== undefined && !team.advancedStatsSource) {
        assert.equal(team.totalSquadValueEur, null, `Fixture ${f.id} ${side}.totalSquadValueEur must be null when unverified`);
      }
      if ('lastSeasonRank' in team && team.lastSeasonRank !== undefined && !team.advancedStatsSource) {
        assert.equal(team.lastSeasonRank, null, `Fixture ${f.id} ${side}.lastSeasonRank must be null when unverified`);
      }
    }

    if (f.h2h) {
      assert.ok(
        ['SPORTAPI_AI', 'SPORTMONKS', 'FOOTBALL_DATA_ORG', 'API_FOOTBALL'].includes(f.h2h.source),
        `Fixture ${f.id} h2h.source must be a recognized provider`
      );
    }

    // Assert authenticity is not VERIFIED_AUTHENTIC
    assert.notEqual(
      f.authenticity?.status,
      'VERIFIED_AUTHENTIC',
      `Fixture ${f.id} must not be labeled VERIFIED_AUTHENTIC in seed data`
    );
  }
});

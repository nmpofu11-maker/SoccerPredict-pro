import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRuntimeManifest } from '../src/services/manifestSanitizer';

test('manifest sanitizer zeroes placeholder stats on non-live verified fixtures', () => {
  const legacyFixtures = [
    {
      id: 'fix-legacy-1',
      kickoffTime: '2026-10-15T18:00:00Z',
      homeTeam: {
        name: 'Arsenal',
        leagueRank: 1,
        points: 45,
        avgPossession: 62.5,
        avgShotsOnTarget: 6.2,
        form: ['W', 'W', 'D'],
        isHomeDominant: true,
      },
      awayTeam: {
        name: 'Chelsea',
        leagueRank: 4,
        points: 38,
        avgPossession: 55.0,
        avgShotsOnTarget: 5.1,
        form: ['W', 'L', 'D'],
        hasTopTierAwayForm: true,
      },
      h2h: { homeWins: 3, draws: 1, awayWins: 1, totalLast5: 5 },
      isStandingsVerified: true,
      authenticity: {
        status: 'VERIFIED_AUTHENTIC',
        source: 'CANONICAL_AUDITED_DATASET',
        authenticityScore: 100,
        isAuthentic: true,
      },
    },
    {
      id: 'fix-legacy-2',
      kickoffTime: '2026-10-15T20:00:00Z',
      homeTeam: {
        name: 'Real Madrid',
        leagueRank: 2,
        points: 40,
        avgPossession: 60,
        form: ['W'],
      },
      awayTeam: {
        name: 'Barcelona',
        leagueRank: 1,
        points: 42,
        avgPossession: 58,
        form: ['W'],
      },
      authenticity: {
        status: 'VERIFIED_AUTHENTIC',
        source: 'HOLLYWOODBETS_OFFICIAL_SLATE_2026',
        authenticityScore: 100,
        isAuthentic: true,
      },
    },
    {
      id: 'fix-live-verified',
      kickoffTime: '2026-10-15T15:00:00Z',
      homeTeam: {
        name: 'Liverpool',
        leagueRank: 1,
        points: 50,
        standingsSource: 'FOOTBALL_DATA_ORG',
        form: ['W', 'W', 'W'],
        formSource: 'FOOTBALL_DATA_ORG',
      },
      awayTeam: {
        name: 'Everton',
        leagueRank: 16,
        points: 18,
        standingsSource: 'FOOTBALL_DATA_ORG',
        form: ['L', 'D', 'L'],
        formSource: 'FOOTBALL_DATA_ORG',
      },
      h2h: { homeWins: 4, draws: 1, awayWins: 0, totalLast5: 5, source: 'FOOTBALL_DATA_ORG' },
      isStandingsVerified: true,
      authenticity: {
        status: 'VERIFIED_AUTHENTIC',
        source: 'FOOTBALL_DATA_ORG',
        verifiedAt: '2026-10-10T12:00:00Z',
        authenticityScore: 100,
        isAuthentic: true,
      },
    },
  ];

  const { fixtures, changedCount } = sanitizeRuntimeManifest(legacyFixtures);

  assert.equal(changedCount, 2, 'Should have modified exactly the 2 legacy non-live verified fixtures');

  // fix-legacy-1 should be cleaned
  const fix1 = fixtures[0];
  assert.equal(fix1.homeTeam.leagueRank, null);
  assert.equal(fix1.homeTeam.points, null);
  assert.equal(fix1.homeTeam.avgPossession, null);
  assert.equal(fix1.homeTeam.avgShotsOnTarget, null);
  assert.deepEqual(fix1.homeTeam.form, []);
  assert.equal(fix1.homeTeam.isHomeDominant, false);
  assert.equal(fix1.awayTeam.hasTopTierAwayForm, false);
  assert.equal(fix1.h2h, null);
  assert.equal(fix1.isStandingsVerified, false);
  assert.equal(fix1.authenticity.status, 'AUTO_REPAIRED');
  assert.equal(fix1.authenticity.source, 'UNVERIFIED_PROVIDER_INGESTION');

  // fix-legacy-2 should be cleaned
  const fix2 = fixtures[1];
  assert.equal(fix2.homeTeam.leagueRank, null);
  assert.equal(fix2.homeTeam.points, null);
  assert.equal(fix2.authenticity.status, 'AUTO_REPAIRED');
  assert.equal(fix2.authenticity.source, 'UNVERIFIED_PROVIDER_INGESTION');

  // fix-live-verified should remain untouched
  const fixLive = fixtures[2];
  assert.equal(fixLive.homeTeam.leagueRank, 1);
  assert.equal(fixLive.homeTeam.points, 50);
  assert.equal(fixLive.authenticity.status, 'UNVERIFIED');
  assert.equal(fixLive.authenticity.source, 'UNVERIFIED_PROVIDER_INGESTION');

  // Running it a second time is idempotent (changedCount is 0)
  const secondRun = sanitizeRuntimeManifest(fixtures);
  assert.equal(secondRun.changedCount, 0, 'Migration must be idempotent');
});

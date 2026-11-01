import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildLiveScoreboardDisplaySlate,
  buildManifestFixtureKey,
  getDisplayCutoffIso,
  hasSafeFixtureIdentity,
  mergeIncomingFixturesIntoManifest,
  readDisplayManifestFile,
  readRawManifestFile,
  selectSettlementCandidatesFromManifest,
} from '../src/services/manifestMerge';
import { resolveVerifiedSettlementMatch } from '../src/utils/settlementMatching';
import { fixtureHasEvidence } from '../src/engine/rulesEngine';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeTeam(name: string, withEvidence = false) {
  return {
    id: `team_${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    name,
    shortName: name.slice(0, 3).toUpperCase(),
    leagueRank: withEvidence ? 3 : null,
    points: withEvidence ? 28 : null,
    ...(withEvidence ? { standingsSource: 'SPORTAPI_AI' } : {}),
    form: withEvidence ? (['W', 'W', 'D', 'W', 'L'] as ('W' | 'D' | 'L')[]) : [],
    ...(withEvidence ? { formSource: 'SPORTAPI_AI' } : {}),
    avgPossession: null,
    avgShotsOnTarget: null,
    isHomeDominant: false,
  };
}

function makeFixture(overrides: Record<string, any>): Record<string, any> {
  const withEvidence = Boolean(overrides._withEvidence);
  const copy = { ...overrides };
  delete copy._withEvidence;
  return {
    id: 'fix_default',
    kickoffTime: '2026-11-01T15:00:00.000Z',
    league: 'English Premier League',
    venue: 'Test Stadium',
    isHighStakes: false,
    motivation: 'regular',
    isStandingsVerified: withEvidence,
    homeTeam: makeTeam(copy.homeName || 'Home FC', withEvidence),
    awayTeam: makeTeam(copy.awayName || 'Away FC', withEvidence),
    h2h: null,
    ...(withEvidence
      ? {
          authenticity: {
            status: 'VERIFIED_AUTHENTIC',
            authenticityScore: 100,
            isAuthentic: true,
            verifiedAt: '2026-10-25T12:00:00.000Z',
            source: 'SPORTAPI_AI',
            checks: [],
          },
        }
      : {}),
    ...copy,
  };
}

test('Requirement E: scoreboard display slate filters active 48h view without mutating or pruning >48h unsettled manifest fixtures', () => {
  const fiveDaysAgoUnsettled = makeFixture({
    id: 'sportapiai_past_5d',
    sportApiAiFixtureId: '5001',
    kickoffTime: '2026-10-27T18:00:00.000Z',
    homeName: 'Orlando Pirates',
    awayName: 'Kaizer Chiefs',
    _withEvidence: true,
  });
  const twentyDaysAgoBookmaker = makeFixture({
    id: 'hollywoodbets_past_20d',
    isBookmakerProtected: true,
    kickoffTime: '2026-10-12T19:00:00.000Z',
    homeName: 'Mamelodi Sundowns',
    awayName: 'AmaZulu',
    odds: { home: 1.55, draw: 3.7, away: 6.2, provider: 'Hollywoodbets' },
  });
  const upcomingEvidenceFixture = makeFixture({
    id: 'sportapiai_upcoming_1',
    sportApiAiFixtureId: '5002',
    kickoffTime: '2026-11-01T17:30:00.000Z',
    homeName: 'Arsenal',
    awayName: 'Liverpool',
    _withEvidence: true,
  });

  const persistedManifest = [
    fiveDaysAgoUnsettled,
    twentyDaysAgoBookmaker,
    upcomingEvidenceFixture,
  ];
  const snapshotBefore = JSON.stringify(persistedManifest);

  const weakerScoreboardIncoming = [
    makeFixture({
      id: 'espn_upcoming_1',
      kickoffTime: '2026-11-01T17:30:00.000Z',
      homeName: 'Arsenal',
      awayName: 'Liverpool',
      _withEvidence: false,
    }),
    makeFixture({
      id: 'espn_upcoming_new',
      kickoffTime: '2026-11-02T15:00:00.000Z',
      homeName: 'Real Madrid',
      awayName: 'Barcelona',
      _withEvidence: false,
    }),
  ];

  const minCutoffDate = '2026-10-30'; // 48h cutoff
  const displaySlate = buildLiveScoreboardDisplaySlate(
    persistedManifest,
    weakerScoreboardIncoming,
    minCutoffDate
  );

  // Underlying persisted manifest array was NOT mutated or truncated
  assert.equal(JSON.stringify(persistedManifest), snapshotBefore);
  assert.equal(persistedManifest.length, 3);

  // Active 48h display slate contains only >= 2026-10-30 fixtures and preserves verified evidence
  assert.equal(displaySlate.length, 2);
  const arsenalMatch = displaySlate.find((f) => f.id === 'sportapiai_upcoming_1');
  assert.ok(arsenalMatch, 'Evidence-bearing upcoming fixture must not be overwritten by weaker ESPN record');
  assert.equal(fixtureHasEvidence(arsenalMatch), true);
});

test('Requirement E: daily ingestion and recalibration manifest merge preserves >48h unsettled, bookmaker-protected, and evidence-bearing fixtures', () => {
  const fiveDaysAgoUnsettled = makeFixture({
    id: 'sportapiai_past_5d',
    sportApiAiFixtureId: '5001',
    kickoffTime: '2026-10-27T18:00:00.000Z',
    homeName: 'Orlando Pirates',
    awayName: 'Kaizer Chiefs',
    _withEvidence: true,
  });
  const twentyDaysAgoBookmaker = makeFixture({
    id: 'hollywoodbets_past_20d',
    isBookmakerProtected: true,
    kickoffTime: '2026-10-12T19:00:00.000Z',
    homeName: 'Mamelodi Sundowns',
    awayName: 'AmaZulu',
    odds: { home: 1.55, draw: 3.7, away: 6.2, provider: 'Hollywoodbets' },
  });
  const upcomingBookmakerProtected = makeFixture({
    id: 'hollywoodbets_upcoming_1',
    isBookmakerProtected: true,
    kickoffTime: '2026-11-01T15:00:00.000Z',
    homeName: 'Chelsea',
    awayName: 'Newcastle United',
    odds: { home: 1.9, draw: 3.6, away: 3.9, provider: 'Hollywoodbets' },
    _withEvidence: true,
  });
  const upcomingEvidenced = makeFixture({
    id: 'sportapiai_upcoming_2',
    sportApiAiFixtureId: '6001',
    kickoffTime: '2026-11-01T20:00:00.000Z',
    homeName: 'Bayern Munich',
    awayName: 'Borussia Dortmund',
    _withEvidence: true,
  });

  const existingManifest = [
    fiveDaysAgoUnsettled,
    twentyDaysAgoBookmaker,
    upcomingBookmakerProtected,
    upcomingEvidenced,
  ];

  const incomingDailyIngest = [
    // Matching bookmaker-protected fixture with a new provider ID: must preserve bookmaker fixture & backfill ID
    makeFixture({
      id: 'sportapiai_9991',
      sportApiAiFixtureId: '9991',
      kickoffTime: '2026-11-01T15:00:00.000Z',
      homeName: 'Chelsea',
      awayName: 'Newcastle United',
      _withEvidence: false,
    }),
    // Weaker schedule-only record for Bayern vs Dortmund: must NOT overwrite evidence
    makeFixture({
      id: 'sportdb_6001',
      kickoffTime: '2026-11-01T20:00:00.000Z',
      homeName: 'Bayern Munich',
      awayName: 'Borussia Dortmund',
      _withEvidence: false,
    }),
    // Brand new upcoming fixture
    makeFixture({
      id: 'sportapiai_7001',
      sportApiAiFixtureId: '7001',
      kickoffTime: '2026-11-02T18:00:00.000Z',
      homeName: 'Inter Milan',
      awayName: 'AC Milan',
      _withEvidence: true,
    }),
  ];

  const { merged, addedCount } = mergeIncomingFixturesIntoManifest(existingManifest, incomingDailyIngest);

  assert.equal(addedCount, 1);
  assert.equal(merged.length, 5);

  // Both >48h-old unsettled fixtures survived intact for the 30-day settlement job!
  assert.ok(merged.some((f) => f.id === 'sportapiai_past_5d'));
  assert.ok(merged.some((f) => f.id === 'hollywoodbets_past_20d'));

  // Upcoming bookmaker-protected fixture kept its ID & odds, and received backfilled sportApiAiFixtureId
  const chelsea = merged.find((f) => f.id === 'hollywoodbets_upcoming_1');
  assert.ok(chelsea);
  assert.equal(chelsea.isBookmakerProtected, true);
  assert.equal(chelsea.odds.home, 1.9);
  assert.equal(chelsea.sportApiAiFixtureId, '9991');

  // Evidence-bearing fixture was NOT replaced by weaker incoming record
  const bayern = merged.find((f) => f.id === 'sportapiai_upcoming_2');
  assert.ok(bayern);
  assert.equal(fixtureHasEvidence(bayern), true);
});

test('20-day-old unsettled fixture remains available to 30-day settlement on disk while hidden from 48-hour UI display', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-settlement-20d-'));
  try {
    const manifestPath = path.join(tmpDir, 'fixtures-manifest.json');
    const nowMs = Date.parse('2026-11-01T12:00:00.000Z');

    const twentyDayOldUnsettled = makeFixture({
      id: 'unsettled_20d',
      sportApiAiFixtureId: '8820',
      kickoffTime: '2026-10-12T19:00:00.000Z', // exactly 20 days old (< 30d lookback, > 48h UI cutoff)
      homeName: 'Mamelodi Sundowns',
      awayName: 'AmaZulu',
      _withEvidence: true,
    });
    const tenDayOldSettled = makeFixture({
      id: 'settled_10d',
      sportApiAiFixtureId: '8810',
      kickoffTime: '2026-10-22T18:00:00.000Z',
      homeName: 'Orlando Pirates',
      awayName: 'Stellenbosch FC',
      _withEvidence: true,
    });
    const thirtyFiveDayOldExpired = makeFixture({
      id: 'expired_35d',
      sportApiAiFixtureId: '8835',
      kickoffTime: '2026-09-27T18:00:00.000Z', // > 30d lookback
      homeName: 'Cape Town City',
      awayName: 'SuperSport United',
      _withEvidence: true,
    });
    const yesterdayUnsettled = makeFixture({
      id: 'unsettled_1d',
      sportApiAiFixtureId: '8801',
      kickoffTime: '2026-10-31T15:00:00.000Z', // within 48h UI cutoff AND within 30d settlement lookback
      homeName: 'Arsenal FC',
      awayName: 'Chelsea FC',
      _withEvidence: true,
    });
    const upcomingFixture = makeFixture({
      id: 'upcoming_today',
      sportApiAiFixtureId: '8899',
      kickoffTime: '2026-11-01T18:00:00.000Z',
      homeName: 'Liverpool FC',
      awayName: 'Brighton',
      _withEvidence: true,
    });

    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        [
          thirtyFiveDayOldExpired,
          twentyDayOldUnsettled,
          tenDayOldSettled,
          yesterdayUnsettled,
          upcomingFixture,
        ],
        null,
        2
      ),
      'utf8'
    );

    // Simulate a live scoreboard display pass + daily ingestion merge into the raw manifest
    const rawBeforeIngest = readRawManifestFile(manifestPath);
    const liveSlate = buildLiveScoreboardDisplaySlate(
      rawBeforeIngest,
      [
        makeFixture({
          id: 'espn_new_upcoming',
          kickoffTime: '2026-11-02T16:00:00.000Z',
          homeName: 'Real Madrid',
          awayName: 'Sevilla',
        }),
      ],
      getDisplayCutoffIso(nowMs)
    );
    assert.equal(liveSlate.some((f) => f.id === 'unsettled_20d'), false);

    const { merged } = mergeIncomingFixturesIntoManifest(rawBeforeIngest, [
      makeFixture({
        id: 'sportapiai_new_upcoming',
        sportApiAiFixtureId: '8900',
        kickoffTime: '2026-11-02T20:00:00.000Z',
        homeName: 'Barcelona',
        awayName: 'Valencia',
        _withEvidence: true,
      }),
    ]);
    fs.writeFileSync(manifestPath, JSON.stringify(merged, null, 2), 'utf8');

    // 1. UI 48-hour display reader (`readDisplayManifestFile` / `readDiskManifest`) hides the 20-day-old fixture
    const uiDisplayFixtures = readDisplayManifestFile(manifestPath, undefined, nowMs);
    assert.equal(uiDisplayFixtures.some((f) => f.id === 'unsettled_20d'), false);
    assert.equal(uiDisplayFixtures.some((f) => f.id === 'unsettled_1d'), true);
    assert.equal(uiDisplayFixtures.some((f) => f.id === 'upcoming_today'), true);
    assert.equal(uiDisplayFixtures.some((f) => f.id === 'sportapiai_new_upcoming'), true);

    // 2. 30-day settlement candidate selector reads unfiltered `readRawManifestFile` and retains the 20-day-old fixture
    const selection = selectSettlementCandidatesFromManifest({
      manifestPath,
      settledIds: new Set(['settled_10d']),
      nowMs,
      lookbackDays: 30,
    });

    assert.equal(
      selection.eligiblePastFixtures.some((f) => f.id === 'unsettled_20d'),
      true,
      '20-day-old unsettled fixture must remain eligible for settlement'
    );
    assert.equal(selection.eligiblePastFixtures.some((f) => f.id === 'unsettled_1d'), true);
    assert.equal(selection.eligiblePastFixtures.some((f) => f.id === 'settled_10d'), false);
    assert.equal(selection.eligiblePastFixtures.some((f) => f.id === 'expired_35d'), false);
    assert.equal(selection.allowedDates.has('2026-10-12'), true);

    const oct12Group = selection.dateGroups.get('2026-10-12') || [];
    assert.equal(oct12Group.length, 1);
    assert.equal(oct12Group[0].id, 'unsettled_20d');

    // Verify settlement matching resolves the 20-day-old fixture against its 2026-10-12 provider result
    const providerResult20d = {
      id: '8820',
      kickoff_utc: '2026-10-12 19:00:00',
      home_team: { name: 'Mamelodi Sundowns' },
      away_team: { name: 'AmaZulu' },
      home_score: 2,
      away_score: 0,
      status: 'FT',
    };
    const matched = resolveVerifiedSettlementMatch({
      idMatch: providerResult20d,
      fixture: oct12Group[0],
      expectedDate: '2026-10-12',
      extractTeams: (m) => ({ home: m.home_team.name, away: m.away_team.name }),
    });
    assert.equal(matched, providerResult20d);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Requirement E: server.ts keeps getLiveScoreboardFixtures read-only by default and settlement reads unfiltered manifest', () => {
  const serverSource = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');

  // getLiveScoreboardFixtures must gate writeDiskManifest behind options.persistToDisk
  const fnStart = serverSource.indexOf('async function getLiveScoreboardFixtures');
  const fnEnd = serverSource.indexOf('const RESULTS_LOG_PATH =', fnStart);
  assert.ok(fnStart !== -1 && fnEnd !== -1, 'Could not locate getLiveScoreboardFixtures in server.ts');
  const scoreboardFnBody = serverSource.slice(fnStart, fnEnd);

  assert.match(scoreboardFnBody, /options:\s*\{\s*persistToDisk\?:\s*boolean\s*\}\s*=\s*\{\}/);
  assert.match(scoreboardFnBody, /if\s*\(options\.persistToDisk\)\s*\{[\s\S]*?writeDiskManifest\(/);
  assert.equal(
    (scoreboardFnBody.match(/writeDiskManifest\(/g) || []).length,
    1,
    'getLiveScoreboardFixtures must only write to disk inside the explicit options.persistToDisk branch'
  );

  // Daily ingest merge must read readRawDiskManifest() rather than 48h-filtered readDiskManifest()
  const ingestStart = serverSource.indexOf('async function runDailyIngestJobUnlocked');
  const ingestEnd = serverSource.indexOf('let dailyIngestJobInFlight', ingestStart);
  assert.ok(ingestStart !== -1 && ingestEnd !== -1);
  const ingestBody = serverSource.slice(ingestStart, ingestEnd);
  assert.doesNotMatch(
    ingestBody,
    /readDiskManifest\(/,
    'runDailyIngestJobUnlocked must use readRawDiskManifest() so >48h unsettled fixtures are never pruned'
  );

  // 30-day settlement job must select candidates from unfiltered manifest, never 48h-filtered readDiskManifest()
  const settlementStart = serverSource.indexOf('async function runSettlementJobUnlocked');
  const settlementEnd = serverSource.indexOf('const runSettlementJob =', settlementStart);
  assert.ok(settlementStart !== -1 && settlementEnd !== -1);
  const settlementBody = serverSource.slice(settlementStart, settlementEnd);
  assert.match(settlementBody, /selectSettlementCandidatesFromManifest\(/);
  assert.doesNotMatch(
    settlementBody,
    /readDiskManifest\(/,
    'runSettlementJobUnlocked must never read the 48-hour-filtered readDiskManifest()'
  );
});

test('Reused or colliding fixture ID preserves 20-day-old unsettled fixture when incoming represents same teams on a different date', () => {
  const twentyDayOldUnsettled = makeFixture({
    id: 'sportapiai_5012',
    sportApiAiFixtureId: '5012',
    kickoffTime: '2026-10-12T19:00:00.000Z', // 20 days old relative to 2026-11-01
    homeName: 'Mamelodi Sundowns',
    awayName: 'AmaZulu',
    _withEvidence: true,
  });

  // Incoming rematch 20 days later reuses BOTH `id` and upstream `sportApiAiFixtureId`
  const incomingSameTeamsDifferentDate = makeFixture({
    id: 'sportapiai_5012',
    sportApiAiFixtureId: '5012',
    kickoffTime: '2026-11-01T19:00:00.000Z',
    homeName: 'Mamelodi Sundowns',
    awayName: 'AmaZulu',
    _withEvidence: false,
  });

  const { merged, addedCount } = mergeIncomingFixturesIntoManifest(
    [twentyDayOldUnsettled],
    [incomingSameTeamsDifferentDate]
  );

  assert.equal(addedCount, 1);
  assert.equal(merged.length, 2, 'Both the 20-day-old fixture and the new-date rematch must remain in the manifest');
  const oct12 = merged.find((f) => f.kickoffTime === '2026-10-12T19:00:00.000Z');
  const nov01 = merged.find((f) => f.kickoffTime === '2026-11-01T19:00:00.000Z');
  assert.ok(oct12, '20-day-old unsettled fixture must not be deleted');
  assert.ok(nov01, 'Incoming different-date fixture must also be retained');
  assert.equal(oct12.sportApiAiFixtureId, '5012', 'Existing 20-day-old provider ID must remain intact');
  assert.equal(fixtureHasEvidence(oct12), true);

  // Same safeguard when the 20-day-old fixture is bookmaker-protected:
  // a different-date rematch with a colliding ID must NOT be swallowed into or corrupt the old record.
  const twentyDayOldBookmaker = makeFixture({
    id: 'hollywoodbets_sundowns_amazulu',
    isBookmakerProtected: true,
    kickoffTime: '2026-10-12T19:00:00.000Z',
    homeName: 'Mamelodi Sundowns',
    awayName: 'AmaZulu',
    odds: { home: 1.55, draw: 3.7, away: 6.2, provider: 'Hollywoodbets' },
  });
  const collidingIdRematch = makeFixture({
    id: 'hollywoodbets_sundowns_amazulu',
    sportApiAiFixtureId: '9999',
    kickoffTime: '2026-11-01T19:00:00.000Z',
    homeName: 'Mamelodi Sundowns',
    awayName: 'AmaZulu',
  });

  const bookmakerMerge = mergeIncomingFixturesIntoManifest(
    [twentyDayOldBookmaker],
    [collidingIdRematch]
  );
  assert.equal(bookmakerMerge.addedCount, 1);
  assert.equal(bookmakerMerge.merged.length, 2);
  const preservedOldBookmaker = bookmakerMerge.merged.find(
    (f) => f.kickoffTime === '2026-10-12T19:00:00.000Z'
  );
  assert.ok(preservedOldBookmaker);
  assert.equal(
    preservedOldBookmaker.sportApiAiFixtureId,
    undefined,
    'Different-date colliding ID must not backfill its provider ID onto the 20-day-old bookmaker fixture'
  );
});

test('Reused or colliding provider ID with a different team pairing or unverified identity never deletes existing fixture', () => {
  const existingFixture = makeFixture({
    id: 'reused_id_77',
    sportApiAiFixtureId: '770077',
    kickoffTime: '2026-10-12T19:00:00.000Z',
    homeName: 'Arsenal FC',
    awayName: 'Chelsea FC',
    _withEvidence: true,
  });

  // Same `id` AND same `sportApiAiFixtureId`, different teams on the same date & kickoff time
  const differentTeamsSameDate = makeFixture({
    id: 'reused_id_77',
    sportApiAiFixtureId: '770077',
    kickoffTime: '2026-10-12T19:00:00.000Z',
    homeName: 'Liverpool FC',
    awayName: 'Everton FC',
    _withEvidence: true,
  });

  // Same `id` AND same `sportApiAiFixtureId`, inverted home/away pairing on the same date & kickoff time
  const invertedTeamsSameDate = makeFixture({
    id: 'reused_id_77',
    sportApiAiFixtureId: '770077',
    kickoffTime: '2026-10-12T19:00:00.000Z',
    homeName: 'Chelsea FC',
    awayName: 'Arsenal FC',
    _withEvidence: true,
  });

  // Same `id`, missing kickoffTime (fixture identity not safely established)
  const undatedSameTeams = makeFixture({
    id: 'reused_id_77',
    kickoffTime: '',
    homeName: 'Arsenal FC',
    awayName: 'Chelsea FC',
    _withEvidence: false,
  });

  const { merged, addedCount } = mergeIncomingFixturesIntoManifest(
    [existingFixture],
    [differentTeamsSameDate, invertedTeamsSameDate, undatedSameTeams]
  );

  assert.equal(addedCount, 3);
  assert.equal(merged.length, 4);
  assert.ok(
    merged.some(
      (f) =>
        f.homeTeam.name === 'Arsenal FC' &&
        f.awayTeam.name === 'Chelsea FC' &&
        f.kickoffTime === '2026-10-12T19:00:00.000Z' &&
        fixtureHasEvidence(f)
    ),
    'Existing Arsenal vs Chelsea fixture on 2026-10-12 must remain intact with its verified evidence'
  );
  assert.ok(
    merged.some((f) => f.homeTeam.name === 'Liverpool FC' && f.awayTeam.name === 'Everton FC'),
    'Different team pairing with reused provider ID must also be preserved'
  );
  assert.ok(
    merged.some((f) => f.homeTeam.name === 'Chelsea FC' && f.awayTeam.name === 'Arsenal FC'),
    'Inverted team pairing with reused provider ID must also be preserved separately'
  );
});

test('Same teams, same date, different kickoff times: both fixtures survive', () => {
  const earlyKickoff = makeFixture({
    id: 'fix_early_1230',
    sportApiAiFixtureId: '9101',
    kickoffTime: '2026-11-01T12:30:00.000Z',
    league: 'English Premier League',
    homeName: 'Arsenal FC',
    awayName: 'Chelsea FC',
    _withEvidence: true,
  });
  const lateKickoff = makeFixture({
    id: 'fix_late_1730',
    sportApiAiFixtureId: '9102',
    kickoffTime: '2026-11-01T17:30:00.000Z',
    league: 'English Premier League',
    homeName: 'Arsenal FC',
    awayName: 'Chelsea FC',
    _withEvidence: false,
  });

  assert.notEqual(
    buildManifestFixtureKey(earlyKickoff),
    buildManifestFixtureKey(lateKickoff),
    'Composite keys must include kickoff-time identity so different kickoffs on the same date stay distinct'
  );

  // Case 1: existing manifest has 12:30 kickoff, incoming has 17:30 kickoff
  const existingPlusIncoming = mergeIncomingFixturesIntoManifest([earlyKickoff], [lateKickoff]);
  assert.equal(existingPlusIncoming.addedCount, 1);
  assert.equal(existingPlusIncoming.merged.length, 2);
  assert.ok(existingPlusIncoming.merged.some((f) => f.kickoffTime === '2026-11-01T12:30:00.000Z'));
  assert.ok(existingPlusIncoming.merged.some((f) => f.kickoffTime === '2026-11-01T17:30:00.000Z'));

  // Case 2: both arrive in the same incoming batch
  const sameBatch = mergeIncomingFixturesIntoManifest([], [earlyKickoff, lateKickoff]);
  assert.equal(sameBatch.addedCount, 2);
  assert.equal(sameBatch.merged.length, 2);
});

test('Same teams, same date and kickoff time, different known competitions: both fixtures survive', () => {
  const mensLeagueFixture = makeFixture({
    id: 'fix_mens_league',
    sportApiAiFixtureId: '9201',
    sportApiAiLeagueId: 17,
    kickoffTime: '2026-11-01T15:00:00.000Z',
    league: 'English Premier League',
    competition: 'English Premier League',
    homeName: 'Manchester United',
    awayName: 'Manchester City',
    _withEvidence: true,
  });
  const cupOrWomensFixture = makeFixture({
    id: 'fix_womens_cup',
    sportApiAiFixtureId: '9202',
    sportApiAiLeagueId: 119,
    kickoffTime: '2026-11-01T15:00:00.000Z',
    league: 'FA Womens Super League',
    competition: 'FA Womens Super League',
    homeName: 'Manchester United',
    awayName: 'Manchester City',
    _withEvidence: true,
  });

  assert.notEqual(
    buildManifestFixtureKey(mensLeagueFixture),
    buildManifestFixtureKey(cupOrWomensFixture),
    'Different known competitions must produce distinct composite keys'
  );

  const { merged, addedCount } = mergeIncomingFixturesIntoManifest(
    [mensLeagueFixture],
    [cupOrWomensFixture]
  );
  assert.equal(addedCount, 1);
  assert.equal(merged.length, 2);
  assert.ok(merged.some((f) => f.id === 'fix_mens_league'));
  assert.ok(merged.some((f) => f.id === 'fix_womens_cup'));

  // Also verify structured league-ID conflict when textual league label happens to match
  const leagueTierOne = makeFixture({
    id: 'fix_league_id_17',
    sportApiAiLeagueId: 17,
    kickoffTime: '2026-11-01T15:00:00.000Z',
    league: 'Premier League',
    homeName: 'Rangers FC',
    awayName: 'Celtic FC',
  });
  const leagueTierOtherCountry = makeFixture({
    id: 'fix_league_id_402',
    sportApiAiLeagueId: 402,
    kickoffTime: '2026-11-01T15:00:00.000Z',
    league: 'Premier League',
    homeName: 'Rangers FC',
    awayName: 'Celtic FC',
  });

  const structuredIdConflict = mergeIncomingFixturesIntoManifest(
    [leagueTierOne],
    [leagueTierOtherCountry]
  );
  assert.equal(structuredIdConflict.addedCount, 1);
  assert.equal(structuredIdConflict.merged.length, 2);
});

test('Same teams, same date, missing competition information or date-only kickoff: ambiguous records are not destructively merged', () => {
  const knownCompExisting = makeFixture({
    id: 'fix_known_comp',
    kickoffTime: '2026-11-01T15:00:00.000Z',
    league: 'English Premier League',
    homeName: 'Arsenal FC',
    awayName: 'Chelsea FC',
    _withEvidence: true,
  });
  const missingCompIncoming = makeFixture({
    id: 'fix_missing_comp_1',
    kickoffTime: '2026-11-01T15:00:00.000Z',
    league: '',
    competition: undefined,
    homeName: 'Arsenal FC',
    awayName: 'Chelsea FC',
    _withEvidence: false,
  });
  const placeholderCompIncoming = makeFixture({
    id: 'fix_missing_comp_1', // even sharing the same fallback ID
    kickoffTime: '2026-11-01T15:00:00.000Z',
    league: 'Unknown League',
    homeName: 'Arsenal FC',
    awayName: 'Chelsea FC',
    _withEvidence: false,
  });
  const dateOnlyKickoffIncoming = makeFixture({
    id: 'fix_date_only',
    kickoffTime: '2026-11-01', // no explicit HH:MM time; must not fabricate 00:00Z
    league: 'English Premier League',
    homeName: 'Arsenal FC',
    awayName: 'Chelsea FC',
    _withEvidence: false,
  });

  // Missing competition or date-only kickoff must NOT fabricate keys
  assert.equal(hasSafeFixtureIdentity(missingCompIncoming), false);
  assert.equal(buildManifestFixtureKey(missingCompIncoming), '');
  assert.equal(hasSafeFixtureIdentity(placeholderCompIncoming), false);
  assert.equal(buildManifestFixtureKey(placeholderCompIncoming), '');
  assert.equal(hasSafeFixtureIdentity(dateOnlyKickoffIncoming), false);
  assert.equal(buildManifestFixtureKey(dateOnlyKickoffIncoming), '');

  // Case 1: existing has known competition, incoming records lack competition or explicit kickoff time
  const res1 = mergeIncomingFixturesIntoManifest(
    [knownCompExisting],
    [missingCompIncoming, placeholderCompIncoming, dateOnlyKickoffIncoming]
  );
  assert.equal(res1.merged.length, 4, 'Ambiguous records must be preserved separately rather than destructively merged');
  assert.ok(res1.merged.some((f) => f.id === 'fix_known_comp' && fixtureHasEvidence(f)));

  // Case 2: existing lacks competition, incoming has known competition
  const res2 = mergeIncomingFixturesIntoManifest([missingCompIncoming], [knownCompExisting]);
  assert.equal(res2.merged.length, 2, 'Missing competition on existing record must not merge into incoming record');
});

test('Two existing manifest records with a colliding composite key: neither is silently discarded', () => {
  const existingRecordA = makeFixture({
    id: 'existing_collision_a',
    sportApiAiFixtureId: '7101',
    kickoffTime: '2026-11-01T15:00:00.000Z',
    league: 'South African Premiership',
    homeName: 'Orlando Pirates',
    awayName: 'Kaizer Chiefs',
    _withEvidence: true,
  });
  const existingRecordB = makeFixture({
    id: 'existing_collision_b',
    sportApiAiFixtureId: '7102',
    kickoffTime: '2026-11-01T15:00:00.000Z',
    league: 'South African Premiership',
    homeName: 'Orlando Pirates',
    awayName: 'Kaizer Chiefs',
    _withEvidence: false,
  });

  assert.equal(
    buildManifestFixtureKey(existingRecordA),
    buildManifestFixtureKey(existingRecordB),
    'Precondition: both existing records resolve to the exact same composite key'
  );

  // Even when an incoming record also shares that ambiguous composite key, none of the records are silently overwritten
  const incomingOnAmbiguousKey = makeFixture({
    id: 'incoming_on_collision_key',
    kickoffTime: '2026-11-01T15:00:00.000Z',
    league: 'South African Premiership',
    homeName: 'Orlando Pirates',
    awayName: 'Kaizer Chiefs',
  });

  const { merged, addedCount } = mergeIncomingFixturesIntoManifest(
    [existingRecordA, existingRecordB],
    [incomingOnAmbiguousKey]
  );

  assert.equal(addedCount, 1);
  assert.equal(merged.length, 3, 'Neither colliding existing record may be silently discarded during manifest loading');
  assert.ok(merged.some((f) => f.id === 'existing_collision_a'));
  assert.ok(merged.some((f) => f.id === 'existing_collision_b'));
  assert.ok(merged.some((f) => f.id === 'incoming_on_collision_key'));
});

test('Safe merge preserves bookmaker-protected fields and stronger verified evidence across both directions', () => {
  // 1. Existing bookmaker-protected fixture WITHOUT evidence + incoming safe match WITH verified evidence:
  //    preserves bookmaker `id`, `isBookmakerProtected`, `odds`, `impliedProbabilities`, backfills provider IDs,
  //    AND upgrades verified team evidence.
  const existingBookmakerNoEvidence = makeFixture({
    id: 'hollywoodbets_arsenal_liverpool',
    isBookmakerProtected: true,
    kickoffTime: '2026-11-01T16:30:00.000Z',
    league: 'English Premier League',
    homeName: 'Arsenal FC',
    awayName: 'Liverpool FC',
    odds: { home: 2.15, draw: 3.4, away: 3.25, provider: 'Hollywoodbets' },
    impliedProbabilities: { home: 44.2, draw: 27.9, away: 27.9, marginPercent: 5.1 },
    _withEvidence: false,
  });
  const incomingPrimaryWithEvidence = makeFixture({
    id: 'sportapiai_8844',
    sportApiAiFixtureId: '8844',
    sportmonksFixtureId: '9944',
    kickoffTime: '2026-11-01T18:30:00+02:00', // identical UTC instant (16:30Z)
    league: 'English Premier League',
    homeName: 'Arsenal FC',
    awayName: 'Liverpool FC',
    _withEvidence: true,
  });

  const safeUpgrade = mergeIncomingFixturesIntoManifest(
    [existingBookmakerNoEvidence],
    [incomingPrimaryWithEvidence]
  );
  assert.equal(safeUpgrade.addedCount, 0);
  assert.equal(safeUpgrade.merged.length, 1);
  assert.equal(safeUpgrade.merged[0].id, 'hollywoodbets_arsenal_liverpool');
  assert.equal(safeUpgrade.merged[0].isBookmakerProtected, true);
  assert.deepEqual(safeUpgrade.merged[0].odds, existingBookmakerNoEvidence.odds);
  assert.deepEqual(
    safeUpgrade.merged[0].impliedProbabilities,
    existingBookmakerNoEvidence.impliedProbabilities
  );
  assert.equal(safeUpgrade.merged[0].sportApiAiFixtureId, '8844');
  assert.equal(safeUpgrade.merged[0].sportmonksFixtureId, '9944');
  assert.equal(fixtureHasEvidence(safeUpgrade.merged[0]), true);

  // 2. Existing fixture WITH verified evidence + incoming explicit bookmaker upload (`incomingAreBookmakerProtected: true`)
  //    WITHOUT evidence: applies bookmaker protection & odds while preserving existing verified team evidence & provider IDs.
  const existingEvidenced = makeFixture({
    id: 'sportapiai_7755',
    sportApiAiFixtureId: '7755',
    kickoffTime: '2026-11-02T14:00:00.000Z',
    league: 'Spanish La Liga',
    homeName: 'Real Madrid',
    awayName: 'FC Barcelona',
    _withEvidence: true,
  });
  const incomingBookmakerUpload = makeFixture({
    id: 'hollywoodbets_el_clasico',
    kickoffTime: '2026-11-02T14:00:00.000Z',
    league: 'Spanish La Liga',
    homeName: 'Real Madrid',
    awayName: 'FC Barcelona',
    odds: { home: 2.05, draw: 3.6, away: 3.4, provider: 'Hollywoodbets' },
    impliedProbabilities: { home: 46.1, draw: 26.2, away: 27.7, marginPercent: 5.8 },
    _withEvidence: false,
  });

  const bookmakerOverlay = mergeIncomingFixturesIntoManifest(
    [existingEvidenced],
    [incomingBookmakerUpload],
    { incomingAreBookmakerProtected: true }
  );
  assert.equal(bookmakerOverlay.addedCount, 0);
  assert.equal(bookmakerOverlay.merged.length, 1);
  assert.equal(bookmakerOverlay.merged[0].id, 'hollywoodbets_el_clasico');
  assert.equal(bookmakerOverlay.merged[0].isBookmakerProtected, true);
  assert.deepEqual(bookmakerOverlay.merged[0].odds, incomingBookmakerUpload.odds);
  assert.equal(bookmakerOverlay.merged[0].sportApiAiFixtureId, '7755');
  assert.equal(fixtureHasEvidence(bookmakerOverlay.merged[0]), true);
});


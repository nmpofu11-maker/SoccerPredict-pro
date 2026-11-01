import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type IngestDiagnostics,
  type IngestProviderDiagnostics,
  type IngestSource,
  readCronStatus,
  updateIngestCronStatus,
} from '../src/services/cronStatusService';
import {
  classifyEmptyIngestOutcome,
  formatIngestSourceLabel,
  resolveFinalIngestSource,
} from '../src/utils/ingestOutcome';

function makeProvider(
  overrides: Partial<IngestProviderDiagnostics> = {}
): IngestProviderDiagnostics {
  return {
    configured: false,
    hasKey: false,
    suspended: false,
    requestedDates: ['2026-11-01', '2026-11-02'],
    requestCount: 0,
    successfulRequests: 0,
    failedRequests: 0,
    httpErrors: [],
    rawRecords: 0,
    mappedRecords: 0,
    rejectedRecords: 0,
    mappingRejectReasons: {},
    notes: [],
    ...overrides,
  };
}

function makeDiagnostics(
  overrides: Partial<IngestDiagnostics> = {}
): IngestDiagnostics {
  return {
    startedAt: '2026-11-01T05:00:00.000Z',
    completedAt: '2026-11-01T05:00:03.000Z',
    timezone: 'Africa/Johannesburg',
    requestedDates: ['2026-11-01', '2026-11-02'],
    sportApiAi: makeProvider(),
    theRundown: makeProvider(),
    pitchApi: makeProvider(),
    sportDb: makeProvider(),
    apiFootball: makeProvider(),
    sportmonks: makeProvider(),
    manifestBefore: 12,
    manifestAfter: 12,
    added: 0,
    sourceUsed: null,
    ...overrides,
  };
}

test('Requirement A: classifies unconfigured/offline mode as informational without live-ingestion claim', () => {
  const diag = makeDiagnostics();
  const outcome = classifyEmptyIngestOutcome(diag);
  assert.equal(outcome.kind, 'unconfigured_offline');
  assert.equal(outcome.success, true);
  assert.match(outcome.message, /Offline mode: no external football API credentials configured/i);
});

test('Requirement A: classifies genuine empty calendar as successful only when active provider checks succeeded cleanly', () => {
  const diag = makeDiagnostics({
    sportApiAi: makeProvider({
      configured: true,
      hasKey: true,
      suspended: false,
      requestCount: 2,
      successfulRequests: 2,
      failedRequests: 0,
      rawRecords: 0,
      mappedRecords: 0,
      rejectedRecords: 0,
    }),
  });
  const outcome = classifyEmptyIngestOutcome(diag);
  assert.equal(outcome.kind, 'empty_calendar');
  assert.equal(outcome.success, true);
  assert.match(outcome.message, /2 successful provider check\(s\), 0 records, 0 errors/);
});

test('Requirement A: classifies all-providers-suspended as unsuccessful (not unconfigured/offline)', () => {
  const diag = makeDiagnostics({
    sportApiAi: makeProvider({
      configured: false,
      hasKey: true,
      suspended: true,
      notes: ['SportAPI.ai is temporarily suspended due to daily rate limits.'],
    }),
    apiFootball: makeProvider({
      configured: false,
      hasKey: true,
      suspended: true,
      notes: ['API-Football is temporarily suspended due to daily rate limits.'],
    }),
    sportmonks: makeProvider({
      configured: false,
      hasKey: true,
      suspended: true,
      notes: ['Sportmonks is temporarily suspended due to daily rate limits.'],
    }),
  });
  const outcome = classifyEmptyIngestOutcome(diag);
  assert.equal(outcome.kind, 'all_suspended');
  assert.equal(outcome.success, false);
  assert.match(outcome.message, /SportAPI\.ai.*API-Football.*Sportmonks/);
  assert.match(outcome.message, /suspended or rate-limited/i);
});

test('Requirement A: classifies mid-run rate-limit truncation with zero records as all_suspended', () => {
  const diag = makeDiagnostics({
    sportApiAi: makeProvider({
      configured: true,
      hasKey: true,
      suspended: true,
      requestCount: 2,
      successfulRequests: 1,
      failedRequests: 0,
      rawRecords: 0,
      notes: ['SportAPI.ai hit daily rate limit on 2026-11-02.'],
    }),
  });
  const outcome = classifyEmptyIngestOutcome(diag);
  assert.equal(outcome.kind, 'all_suspended');
  assert.equal(outcome.success, false);
});

test('Requirement A: classifies provider HTTP/transport failures as unsuccessful', () => {
  const diag = makeDiagnostics({
    sportApiAi: makeProvider({
      configured: true,
      hasKey: true,
      requestCount: 2,
      successfulRequests: 0,
      failedRequests: 2,
      httpErrors: ['HTTP 502 Bad Gateway', 'HTTP 502 Bad Gateway'],
    }),
    theRundown: makeProvider({
      configured: true,
      hasKey: true,
      requestCount: 2,
      successfulRequests: 0,
      failedRequests: 2,
      httpErrors: ['TheRundown HTTP 403'],
    }),
  });
  const outcome = classifyEmptyIngestOutcome(diag);
  assert.equal(outcome.kind, 'provider_failure');
  assert.equal(outcome.success, false);
  assert.match(outcome.message, /SportAPI\.ai \(2 failed\)/);
  assert.match(outcome.message, /TheRundown\.io \(2 failed\)/);
  assert.match(outcome.message, /HTTP 502 Bad Gateway/);
});

test('Requirement A: classifies complete mapping rejection as unsuccessful when raw records > 0 and mapped === 0', () => {
  const diag = makeDiagnostics({
    pitchApi: makeProvider({
      configured: true,
      hasKey: true,
      requestCount: 2,
      successfulRequests: 2,
      failedRequests: 0,
      rawRecords: 14,
      mappedRecords: 0,
      rejectedRecords: 14,
      mappingRejectReasons: { unsupported_or_missing_team_or_kickoff: 14 },
    }),
  });
  const outcome = classifyEmptyIngestOutcome(diag);
  assert.equal(outcome.kind, 'mapping_rejected');
  assert.equal(outcome.success, false);
  assert.match(outcome.message, /PitchAPI \(14 raw, 14 rejected\)/);
});

test('Requirement D: exhaustive formatIngestSourceLabel covers every IngestSource and never defaults null/unknown to Sportmonks', () => {
  const expectedLabels: Record<IngestSource, string> = {
    SPORTAPI_AI: 'SportAPI.ai',
    THERUNDOWN: 'TheRundown.io',
    PITCHAPI: 'PitchAPI',
    SPORTDB: 'SportDB',
    API_FOOTBALL: 'API-Football',
    SPORTMONKS: 'Sportmonks',
    LIVE_SCOREBOARD: 'ESPN Live Scoreboard',
    PERSISTED_MANIFEST: 'Persisted Manifest',
  };

  for (const [source, expected] of Object.entries(expectedLabels) as Array<[IngestSource, string]>) {
    assert.equal(formatIngestSourceLabel(source), expected);
  }
  assert.equal(formatIngestSourceLabel(null), 'None');
  assert.equal(formatIngestSourceLabel(undefined), 'None');
});

test('Requirement D: resolveFinalIngestSource attributes primary, secondary, ESPN, persisted-only, and persisted+enriched runs accurately', () => {
  // 1. Primary providers
  for (const primary of ['SPORTAPI_AI', 'THERUNDOWN', 'PITCHAPI', 'SPORTDB'] as const) {
    const res = resolveFinalIngestSource({
      primarySource: primary,
      seededFromPersistedCount: 0,
      afterProviderEnrichmentCount: 10,
      apiFootballMappedFixtures: 4,
      sportmonksMappedFixtures: 3,
      enrichedTeamsCount: 4,
      footballDataEnrichedCount: 2,
      liveScoreboardCount: 0,
    });
    assert.equal(res.sourceUsed, primary);
    assert.equal(res.sourceDisplayLabel, formatIngestSourceLabel(primary));
  }

  // 2. API-Football as sole schedule source
  assert.deepEqual(
    resolveFinalIngestSource({
      primarySource: null,
      seededFromPersistedCount: 0,
      afterProviderEnrichmentCount: 8,
      apiFootballMappedFixtures: 8,
      sportmonksMappedFixtures: 0,
      enrichedTeamsCount: 8,
      footballDataEnrichedCount: 0,
      liveScoreboardCount: 0,
    }),
    { sourceUsed: 'API_FOOTBALL', sourceDisplayLabel: 'API-Football' }
  );

  // 3. Sportmonks as sole schedule source
  assert.deepEqual(
    resolveFinalIngestSource({
      primarySource: null,
      seededFromPersistedCount: 0,
      afterProviderEnrichmentCount: 6,
      apiFootballMappedFixtures: 0,
      sportmonksMappedFixtures: 6,
      enrichedTeamsCount: 6,
      footballDataEnrichedCount: 0,
      liveScoreboardCount: 0,
    }),
    { sourceUsed: 'SPORTMONKS', sourceDisplayLabel: 'Sportmonks' }
  );

  // 4. ESPN Live Scoreboard fallback
  assert.deepEqual(
    resolveFinalIngestSource({
      primarySource: null,
      seededFromPersistedCount: 0,
      afterProviderEnrichmentCount: 0,
      apiFootballMappedFixtures: 0,
      sportmonksMappedFixtures: 0,
      enrichedTeamsCount: 0,
      footballDataEnrichedCount: 0,
      liveScoreboardCount: 9,
    }),
    { sourceUsed: 'LIVE_SCOREBOARD', sourceDisplayLabel: 'ESPN Live Scoreboard' }
  );

  // 5. Persisted-only manifest reuse
  assert.deepEqual(
    resolveFinalIngestSource({
      primarySource: null,
      seededFromPersistedCount: 5,
      afterProviderEnrichmentCount: 5,
      apiFootballMappedFixtures: 0,
      sportmonksMappedFixtures: 0,
      enrichedTeamsCount: 0,
      footballDataEnrichedCount: 0,
      liveScoreboardCount: 0,
    }),
    { sourceUsed: 'PERSISTED_MANIFEST', sourceDisplayLabel: 'Persisted Manifest' }
  );

  // 6. Persisted manifest reused and enriched in-place by API-Football + Football-Data.org
  assert.deepEqual(
    resolveFinalIngestSource({
      primarySource: null,
      seededFromPersistedCount: 5,
      afterProviderEnrichmentCount: 5,
      apiFootballMappedFixtures: 5,
      sportmonksMappedFixtures: 0,
      enrichedTeamsCount: 4,
      footballDataEnrichedCount: 1,
      liveScoreboardCount: 0,
    }),
    {
      sourceUsed: 'PERSISTED_MANIFEST',
      sourceDisplayLabel: 'Persisted Manifest (enriched via API-Football, Football-Data.org)',
    }
  );

  // 7. Persisted manifest reused and expanded with new schedule fixtures from API-Football
  assert.deepEqual(
    resolveFinalIngestSource({
      primarySource: null,
      seededFromPersistedCount: 5,
      afterProviderEnrichmentCount: 12,
      apiFootballMappedFixtures: 9,
      sportmonksMappedFixtures: 0,
      enrichedTeamsCount: 7,
      footballDataEnrichedCount: 0,
      liveScoreboardCount: 0,
    }),
    {
      sourceUsed: 'API_FOOTBALL',
      sourceDisplayLabel: 'API-Football (merged with Persisted Manifest)',
    }
  );
});

test('Requirement D: persisted cron status maintains exact parity between top-level sourceUsed and diagnostics.sourceUsed', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-source-parity-'));
  const statusFile = path.join(tmpDir, 'cron-status.json');
  try {
    const allSources: Array<IngestSource | null> = [
      'SPORTAPI_AI',
      'THERUNDOWN',
      'PITCHAPI',
      'SPORTDB',
      'API_FOOTBALL',
      'SPORTMONKS',
      'LIVE_SCOREBOARD',
      'PERSISTED_MANIFEST',
      null,
    ];

    for (const source of allSources) {
      const diagnostics = makeDiagnostics({ sourceUsed: source });
      updateIngestCronStatus(
        {
          lastRunAt: '2026-11-01T05:00:05.000Z',
          lastSuccess: source !== null,
          lastMessage: `Source test: ${formatIngestSourceLabel(source)}`,
          fixturesIngested: source ? 5 : 0,
          sourceUsed: source,
          outcomeKind: source ? 'ingested' : 'all_suspended',
          diagnostics,
        },
        statusFile
      );

      const saved = readCronStatus(statusFile);
      assert.equal(saved.ingest.sourceUsed, source);
      assert.equal(saved.ingest.diagnostics?.sourceUsed, source);
      assert.equal(saved.ingest.sourceUsed, saved.ingest.diagnostics?.sourceUsed);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

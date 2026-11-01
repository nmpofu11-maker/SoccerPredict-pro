import type {
  IngestDiagnostics,
  IngestOutcomeKind,
  IngestProviderDiagnostics,
  IngestSource,
} from '../services/cronStatusService';

export interface EmptyIngestClassification {
  kind: Exclude<IngestOutcomeKind, 'ingested'>;
  success: boolean;
  message: string;
}

export interface ResolveIngestSourceInput {
  primarySource: 'SPORTAPI_AI' | 'THERUNDOWN' | 'PITCHAPI' | 'SPORTDB' | null;
  seededFromPersistedCount: number;
  afterProviderEnrichmentCount: number;
  apiFootballMappedFixtures: number;
  sportmonksMappedFixtures: number;
  enrichedTeamsCount: number;
  footballDataEnrichedCount: number;
  liveScoreboardCount: number;
}

export interface ResolvedIngestSource {
  sourceUsed: IngestSource | null;
  sourceDisplayLabel: string;
}

const PROVIDER_ENTRIES: ReadonlyArray<{
  key: keyof Pick<
    IngestDiagnostics,
    'sportApiAi' | 'theRundown' | 'pitchApi' | 'sportDb' | 'apiFootball' | 'sportmonks'
  >;
  label: string;
}> = [
  { key: 'sportApiAi', label: 'SportAPI.ai' },
  { key: 'theRundown', label: 'TheRundown.io' },
  { key: 'pitchApi', label: 'PitchAPI' },
  { key: 'sportDb', label: 'SportDB' },
  { key: 'apiFootball', label: 'API-Football' },
  { key: 'sportmonks', label: 'Sportmonks' },
];

function providerHasCredentials(provider: IngestProviderDiagnostics): boolean {
  if (typeof provider.hasKey === 'boolean') return provider.hasKey;
  if (provider.configured) return true;
  if (provider.suspended) return true;
  return provider.notes.some((note) =>
    /suspended|rate[- ]limit|cooldown|paused/i.test(note)
  );
}

function providerIsSuspended(provider: IngestProviderDiagnostics): boolean {
  if (typeof provider.suspended === 'boolean') return provider.suspended;
  if (typeof provider.hasKey === 'boolean' && provider.hasKey && !provider.configured) {
    return true;
  }
  return provider.notes.some((note) =>
    /suspended|rate[- ]limit|cooldown|paused/i.test(note)
  );
}

/**
 * Exhaustive human-readable label mapping for every IngestSource.
 * Never defaults an unknown, null, or undefined source to Sportmonks.
 */
export function formatIngestSourceLabel(source: IngestSource | null | undefined): string {
  if (source === null || source === undefined) return 'None';
  switch (source) {
    case 'SPORTAPI_AI':
      return 'SportAPI.ai';
    case 'THERUNDOWN':
      return 'TheRundown.io';
    case 'PITCHAPI':
      return 'PitchAPI';
    case 'SPORTDB':
      return 'SportDB';
    case 'API_FOOTBALL':
      return 'API-Football';
    case 'SPORTMONKS':
      return 'Sportmonks';
    case 'LIVE_SCOREBOARD':
      return 'ESPN Live Scoreboard';
    case 'PERSISTED_MANIFEST':
      return 'Persisted Manifest';
    default: {
      const _exhaustive: never = source;
      return String(_exhaustive || 'Unknown Source');
    }
  }
}

/**
 * Resolves the authoritative IngestSource and human-readable attribution label
 * after primary feeds, persisted-manifest reuse, secondary provider enrichment,
 * and ESPN live-scoreboard fallback have all completed.
 */
export function resolveFinalIngestSource(input: ResolveIngestSourceInput): ResolvedIngestSource {
  if (input.primarySource !== null) {
    return {
      sourceUsed: input.primarySource,
      sourceDisplayLabel: formatIngestSourceLabel(input.primarySource),
    };
  }

  if (input.liveScoreboardCount > 0) {
    return {
      sourceUsed: 'LIVE_SCOREBOARD',
      sourceDisplayLabel: formatIngestSourceLabel('LIVE_SCOREBOARD'),
    };
  }

  if (input.seededFromPersistedCount > 0) {
    const addedScheduleFixtures = input.afterProviderEnrichmentCount > input.seededFromPersistedCount;
    if (addedScheduleFixtures && input.apiFootballMappedFixtures > 0) {
      return {
        sourceUsed: 'API_FOOTBALL',
        sourceDisplayLabel: 'API-Football (merged with Persisted Manifest)',
      };
    }
    if (addedScheduleFixtures && input.sportmonksMappedFixtures > 0) {
      return {
        sourceUsed: 'SPORTMONKS',
        sourceDisplayLabel: 'Sportmonks (merged with Persisted Manifest)',
      };
    }

    const enrichers: string[] = [];
    if (input.enrichedTeamsCount > 0) {
      if (input.apiFootballMappedFixtures > 0 && input.sportmonksMappedFixtures > 0) {
        enrichers.push('API-Football + Sportmonks');
      } else if (input.apiFootballMappedFixtures > 0) {
        enrichers.push('API-Football');
      } else if (input.sportmonksMappedFixtures > 0) {
        enrichers.push('Sportmonks');
      } else {
        enrichers.push('provider enrichment');
      }
    }
    if (input.footballDataEnrichedCount > 0) {
      enrichers.push('Football-Data.org');
    }

    const baseLabel = formatIngestSourceLabel('PERSISTED_MANIFEST');
    return {
      sourceUsed: 'PERSISTED_MANIFEST',
      sourceDisplayLabel: enrichers.length > 0
        ? `${baseLabel} (enriched via ${enrichers.join(', ')})`
        : baseLabel,
    };
  }

  if (input.afterProviderEnrichmentCount > 0) {
    if (input.apiFootballMappedFixtures > 0) {
      return {
        sourceUsed: 'API_FOOTBALL',
        sourceDisplayLabel: formatIngestSourceLabel('API_FOOTBALL'),
      };
    }
    if (input.sportmonksMappedFixtures > 0) {
      return {
        sourceUsed: 'SPORTMONKS',
        sourceDisplayLabel: formatIngestSourceLabel('SPORTMONKS'),
      };
    }
  }

  return {
    sourceUsed: null,
    sourceDisplayLabel: formatIngestSourceLabel(null),
  };
}

/**
 * Pure classification helper for ingestion runs that produced zero usable
 * incoming fixtures (`mapped.length === 0`).
 */
export function classifyEmptyIngestOutcome(
  diagnostics: IngestDiagnostics
): EmptyIngestClassification {
  const dateLabel = diagnostics.requestedDates.length > 0
    ? diagnostics.requestedDates.join(' or ')
    : 'requested dates';

  const credentialedLabels: string[] = [];
  const suspendedLabels: string[] = [];
  const failedLabels: string[] = [];
  const rejectedLabels: string[] = [];
  const httpErrors: string[] = [];

  let totalSuccessfulRequests = 0;
  let totalFailedRequests = 0;
  let totalRawRecords = 0;
  let totalMappedRecords = 0;
  let totalRejectedRecords = 0;
  let anyProviderCompletedAllDates = false;
  const expectedDateChecks = Math.max(1, diagnostics.requestedDates.length);

  for (const { key, label } of PROVIDER_ENTRIES) {
    const p = diagnostics[key];
    const hasKey = providerHasCredentials(p);
    const suspended = providerIsSuspended(p);

    if (hasKey) credentialedLabels.push(label);
    if (hasKey && suspended) suspendedLabels.push(label);
    if (p.failedRequests > 0) failedLabels.push(`${label} (${p.failedRequests} failed)`);
    if (p.rawRecords > 0 && p.mappedRecords === 0) {
      rejectedLabels.push(`${label} (${p.rawRecords} raw, ${p.rejectedRecords} rejected)`);
    }
    for (const err of p.httpErrors) {
      if (err) httpErrors.push(`${label}: ${err}`);
    }

    totalSuccessfulRequests += p.successfulRequests;
    totalFailedRequests += p.failedRequests;
    totalRawRecords += p.rawRecords;
    totalMappedRecords += p.mappedRecords;
    totalRejectedRecords += p.rejectedRecords;

    if (hasKey && p.failedRequests === 0 && p.successfulRequests >= expectedDateChecks && !suspended) {
      anyProviderCompletedAllDates = true;
    }
  }

  // 1. Offline / unconfigured mode: no provider credentials exist at all.
  if (credentialedLabels.length === 0) {
    return {
      kind: 'unconfigured_offline',
      success: true,
      message: 'Offline mode: no external football API credentials configured; retaining existing manifest fixtures.',
    };
  }

  // 2. Complete mapping rejection: provider(s) returned raw records, none mapped.
  if (totalRawRecords > 0 && totalMappedRecords === 0) {
    const providerDetail = rejectedLabels.length > 0
      ? rejectedLabels.join('; ')
      : `${totalRawRecords} raw record(s), ${totalRejectedRecords} rejected`;
    return {
      kind: 'mapping_rejected',
      success: false,
      message: `Ingestion failed for ${dateLabel}: provider(s) returned records that could not be mapped (${providerDetail}). Existing manifest retained.`,
    };
  }

  // 3. Provider HTTP / transport failures.
  if (totalFailedRequests > 0) {
    const errorSnippet = httpErrors.length > 0 ? ` [${httpErrors.slice(0, 2).join(' | ')}]` : '';
    const suspendedSnippet = suspendedLabels.length > 0
      ? ` Suspended: ${suspendedLabels.join(', ')}.`
      : '';
    return {
      kind: 'provider_failure',
      success: false,
      message: `Ingestion failed for ${dateLabel}: ${failedLabels.join(', ')}${errorSnippet}.${suspendedSnippet} Existing manifest retained.`,
    };
  }

  // 4. All credentialed providers suspended / rate-limited (or truncated mid-run by rate limit).
  if (totalSuccessfulRequests === 0 || (suspendedLabels.length > 0 && !anyProviderCompletedAllDates)) {
    const names = suspendedLabels.length > 0 ? suspendedLabels.join(', ') : credentialedLabels.join(', ');
    return {
      kind: 'all_suspended',
      success: false,
      message: `Ingestion unsuccessful for ${dateLabel}: configured provider(s) (${names}) are currently suspended or rate-limited. Existing manifest retained.`,
    };
  }

  // 5. Genuine empty calendar response: active provider checks succeeded cleanly with zero records.
  return {
    kind: 'empty_calendar',
    success: true,
    message: `No scheduled fixtures returned for ${dateLabel} (${totalSuccessfulRequests} successful provider check(s), 0 records, 0 errors). Existing manifest retained.`,
  };
}

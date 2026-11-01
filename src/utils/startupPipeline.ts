export interface StartupJobSummary {
  success: boolean;
  message: string;
  count: number;
}

export interface StartupPipelineDeps {
  runIngest: () => Promise<StartupJobSummary>;
  runSettlement: () => Promise<StartupJobSummary>;
  autoSettlementEnabled: boolean;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface StartupPipelineSummary {
  ingestRan: boolean;
  ingestSucceeded: boolean;
  settlementRan: boolean;
  settlementSucceeded: boolean;
}

/**
 * Coordinates the initial post-boot pipeline pass.
 *
 * Daily ingestion runs first so shared provider caches warm without rate-limit
 * contention, then settlement runs independently against already-persisted
 * fixtures regardless of whether startup ingestion succeeded, returned
 * `success: false`, or threw an exception.
 */
export async function runStartupPipelinePass(
  deps: StartupPipelineDeps
): Promise<StartupPipelineSummary> {
  const logger = deps.logger ?? console;
  let ingestRan = false;
  let ingestSucceeded = false;
  let settlementRan = false;
  let settlementSucceeded = false;

  try {
    ingestRan = true;
    const ingestResult = await deps.runIngest();
    ingestSucceeded = Boolean(ingestResult?.success);
    if (!ingestSucceeded) {
      logger.warn(
        `[cron:ingest] Startup ingestion completed without usable incoming fixtures (${ingestResult?.message || 'unsuccessful outcome'}); proceeding with independent settlement of persisted fixtures.`
      );
    }
  } catch (err) {
    logger.error(
      '[cron:ingest] Startup ingestion threw an unexpected error; proceeding with independent settlement of persisted fixtures:',
      err
    );
  }

  if (deps.autoSettlementEnabled) {
    try {
      settlementRan = true;
      const settlementResult = await deps.runSettlement();
      settlementSucceeded = Boolean(settlementResult?.success);
      if (!settlementSucceeded) {
        logger.warn(
          `[cron:settlement] Startup settlement completed with issues: ${settlementResult?.message || 'unsuccessful outcome'}`
        );
      }
    } catch (err) {
      logger.error('[cron:settlement] Startup settlement threw an unexpected error:', err);
    }
  }

  return {
    ingestRan,
    ingestSucceeded,
    settlementRan,
    settlementSucceeded,
  };
}

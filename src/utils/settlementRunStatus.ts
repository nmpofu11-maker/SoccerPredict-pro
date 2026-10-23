export interface SettlementRunStatus {
  success: boolean;
  message: string;
}

export function summarizeSettlementRun(
  settledCount: number,
  unsettledCount: number,
  providerFailureCount: number,
  providerQueryCount: number,
): SettlementRunStatus {
  const failures = Math.max(0, Math.trunc(providerFailureCount));
  const queries = Math.max(0, Math.trunc(providerQueryCount));
  const failureNote = failures > 0
    ? ` ${failures} provider quer${failures === 1 ? 'y' : 'ies'} failed.`
    : '';
  const noQueryNote = queries === 0 ? ' No provider queries were made.' : '';

  return {
    success: failures === 0 && queries > 0,
    message: `Settled ${settledCount} of ${unsettledCount} unsettled past fixtures.${failureNote}${noQueryNote}`,
  };
}

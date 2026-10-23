/**
 * A "Quick Bet" is a value recommendation, not merely the most likely outcome.
 * Require verified model evidence, official standings provenance, a high leading
 * probability, and a sourced market price with at least 5% model expected value.
 */
export interface QuickBetEligibilityInput {
  hasPredictionEvidence: boolean;
  hasVerifiedStandings: boolean;
  modelLeaderProbabilityPct: number;
  pickProbabilityPct: number | null;
  marketOdds: number | null;
  oddsSource: string | null;
}

export function isQuickBetEligible(input: QuickBetEligibilityInput): boolean {
  const {
    hasPredictionEvidence,
    hasVerifiedStandings,
    modelLeaderProbabilityPct,
    pickProbabilityPct,
    marketOdds,
    oddsSource,
  } = input;

  if (!hasPredictionEvidence || !hasVerifiedStandings) return false;
  if (!Number.isFinite(modelLeaderProbabilityPct) || modelLeaderProbabilityPct <= 80) return false;
  if (pickProbabilityPct === null || !Number.isFinite(pickProbabilityPct) || pickProbabilityPct <= 0 || pickProbabilityPct > 100) return false;
  if (marketOdds === null || !Number.isFinite(marketOdds) || marketOdds <= 1.05) return false;
  if (typeof oddsSource !== 'string' || oddsSource.trim().length === 0) return false;

  const expectedReturn = (pickProbabilityPct / 100) * marketOdds - 1;
  return expectedReturn >= 0.05;
}

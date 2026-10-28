export interface FixtureEligibilitySummary {
  totalFixtures: number;
  providerIdentified: number;
  authenticityVerified: number;
  twoSidedEvidence: number;
  eligibleForAutomaticPrediction: number;
  blockedByAuthenticity: number;
  blockedByTeamEvidence: number;
}

/**
 * Separates schedule traceability, independent authenticity, and team evidence.
 * A fixture is eligible only when authenticity is explicitly verified AND the
 * prediction engine confirms sourced strength evidence for both teams.
 */
export function summarizeFixtureEligibility(
  fixtures: any[],
  hasTwoSidedEvidence: (fixture: any) => boolean,
): FixtureEligibilitySummary {
  const providerIdentified = fixtures.filter(
    (fixture) => fixture?.fixtureIdentityStatus === 'PROVIDER_IDENTIFIED',
  ).length;
  const authenticityVerified = fixtures.filter(
    (fixture) => fixture?.authenticity?.isAuthentic === true,
  ).length;
  const twoSidedEvidence = fixtures.filter(hasTwoSidedEvidence).length;
  const eligibleForAutomaticPrediction = fixtures.filter(
    (fixture) =>
      fixture?.authenticity?.isAuthentic === true && hasTwoSidedEvidence(fixture),
  ).length;

  return {
    totalFixtures: fixtures.length,
    providerIdentified,
    authenticityVerified,
    twoSidedEvidence,
    eligibleForAutomaticPrediction,
    blockedByAuthenticity: fixtures.filter(
      (fixture) => fixture?.authenticity?.isAuthentic !== true,
    ).length,
    blockedByTeamEvidence: fixtures.filter(
      (fixture) => !hasTwoSidedEvidence(fixture),
    ).length,
  };
}

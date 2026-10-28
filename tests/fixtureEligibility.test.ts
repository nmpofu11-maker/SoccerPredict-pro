import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFixtureEligibility } from '../src/services/fixtureEligibility';

test('automatic eligibility requires explicit authenticity and two-sided evidence', () => {
  const fixtures = [
    {
      fixtureIdentityStatus: 'PROVIDER_IDENTIFIED',
      authenticity: { isAuthentic: true },
      twoSidedEvidence: true,
    },
    {
      fixtureIdentityStatus: 'PROVIDER_IDENTIFIED',
      authenticity: { isAuthentic: false },
      twoSidedEvidence: true,
    },
    {
      fixtureIdentityStatus: 'UNVERIFIED',
      authenticity: { isAuthentic: true },
      twoSidedEvidence: false,
    },
    {
      fixtureIdentityStatus: 'PROVIDER_IDENTIFIED',
      twoSidedEvidence: true,
    },
  ];

  const summary = summarizeFixtureEligibility(fixtures, (fixture) => fixture.twoSidedEvidence);

  assert.deepEqual(summary, {
    totalFixtures: 4,
    providerIdentified: 3,
    authenticityVerified: 2,
    twoSidedEvidence: 3,
    eligibleForAutomaticPrediction: 1,
    blockedByAuthenticity: 2,
    blockedByTeamEvidence: 1,
  });
});

test('empty slate reports zero eligibility without inventing fixtures', () => {
  assert.deepEqual(summarizeFixtureEligibility([], () => false), {
    totalFixtures: 0,
    providerIdentified: 0,
    authenticityVerified: 0,
    twoSidedEvidence: 0,
    eligibleForAutomaticPrediction: 0,
    blockedByAuthenticity: 0,
    blockedByTeamEvidence: 0,
  });
});

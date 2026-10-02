import { MatchFixture } from '../types/soccer';
import { verifyAndSanitizeFixture } from './dataIntegrityValidator';

export interface SanitizeManifestResult {
  fixtures: MatchFixture[];
  changedCount: number;
}

export function sanitizeRuntimeManifest(rawFixtures: unknown[]): SanitizeManifestResult {
  if (!Array.isArray(rawFixtures)) {
    return { fixtures: [], changedCount: 0 };
  }

  let changedCount = 0;
  const sanitizedList: MatchFixture[] = [];

  for (const raw of rawFixtures) {
    if (!raw || typeof raw !== 'object') continue;
    const candidate = raw as { id?: unknown };
    if (!candidate.id) continue;
    const { fixture, repairs } = verifyAndSanitizeFixture(raw as MatchFixture);
    if (repairs.length > 0) {
      changedCount++;
    }
    sanitizedList.push(fixture);
  }

  return {
    fixtures: sanitizedList,
    changedCount,
  };
}

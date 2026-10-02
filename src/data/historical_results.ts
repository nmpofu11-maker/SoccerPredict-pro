import type { HistoricalMatchResult } from '../types/soccer';

/**
 * No static historical results are shipped as ground truth.
 *
 * Previous committed entries contained scores, table positions, tactical
 * statistics and match narratives without source/provenance metadata. They
 * must not train the model or appear as verified form/H2H evidence.
 *
 * This collection is intentionally empty. Real completed matches are loaded
 * from the server settlement pipeline and persisted with provider provenance.
 */
export const HISTORICAL_MATCH_RESULTS: HistoricalMatchResult[] = [];

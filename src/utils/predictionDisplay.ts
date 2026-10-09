import type { PredictionResult } from '../types/soccer';

export interface DisplayPredictionProbabilities {
  home: number | null;
  draw: number | null;
  away: number | null;
}

/**
 * Neutral-prior values are useful internally, but are not fixture-specific
 * evidence. Hide them from the prediction card until verified evidence exists.
 */
export function getDisplayPredictionProbabilities(
  prediction: Pick<PredictionResult, 'hasEvidence' | 'homeWinPct' | 'drawPct' | 'awayWinPct'>
): DisplayPredictionProbabilities {
  if (!prediction.hasEvidence) return { home: null, draw: null, away: null };

  return {
    home: Number.isFinite(prediction.homeWinPct) ? prediction.homeWinPct : null,
    draw: Number.isFinite(prediction.drawPct) ? prediction.drawPct : null,
    away: Number.isFinite(prediction.awayWinPct) ? prediction.awayWinPct : null,
  };
}

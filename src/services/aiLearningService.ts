import { LearningModelState, AITacticalSynthesis, HistoricalEvaluation } from '../types/soccer';
import { getAdminApiHeaders } from './adminAuthService';

export async function requestAITacticalSynthesis(
  state: LearningModelState,
  recentEvaluations: HistoricalEvaluation[]
): Promise<AITacticalSynthesis> {
  try {
    const res = await fetch('/api/ai/tactical-learning', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAdminApiHeaders(),
      },
      body: JSON.stringify({
        accuracyPct: state.accuracyPct,
        brierLoss: state.brierLoss,
        totalEpochs: state.totalEpochsTrained,
        weights: state.weights,
        recentEvaluations: (recentEvaluations || []).slice(0, 8).map(e => ({
          match: `${e?.fixture?.homeTeam?.name || 'Home'} vs ${e?.fixture?.awayTeam?.name || 'Away'}`,
          actual: e?.actualOutcome || 'draw',
          predicted: e?.predictedOutcome || 'draw',
          correct: e?.isCorrect || false,
          probs: e?.probabilities || null,
        })),
      }),
    });

    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data && data.synthesis) {
      return data.synthesis as AITacticalSynthesis;
    }
    throw new Error('Invalid synthesis format in response');
  } catch (err) {
    console.warn('AI tactical synthesis unavailable:', err);
    return {
      summary: 'AI tactical synthesis is unavailable because the synthesis service did not return a measured result.',
      recommendations: [],
      ruleEfficiency: [],
      timestamp: new Date().toISOString(),
    };
  }
}

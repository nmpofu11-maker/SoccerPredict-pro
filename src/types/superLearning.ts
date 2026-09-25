export interface LearnedCoefficients {
  home_advantage_multiplier: number;
  form_momentum_weight: number;
  volatility_index: number;
  fatigue_penalty_modifier: number;
}

export interface TeamIntelligenceMatrixEntry {
  sample_size_matches: number;
  learned_coefficients: LearnedCoefficients;
  lastUpdated?: string;
  clubName?: string;
}

export type TeamIntelligenceMatrices = Record<string, TeamIntelligenceMatrixEntry>;

export interface AggressiveSuperLearningSyncPayload {
  sync_timestamp: string;
  model_engine: string;
  meta_improvement_notes: string;
  team_intelligence_matrices: Record<
    string,
    {
      sample_size_matches: number;
      learned_coefficients: {
        home_advantage_multiplier: number;
        form_momentum_weight: number;
        volatility_index: number;
        fatigue_penalty_modifier: number;
      };
    }
  >;
}

export interface SuperLearningTelemetry {
  protocolActive: boolean;
  totalSuperEpochs: number;
  unboundedLearningRate: number;
  lossVelocity: number;
  convergencesAchieved: number;
  bestBrierLoss: number;
  peakAccuracyPct: number;
  lastOptimizationTimestamp: string;
  activeOptimizers: string[];
}

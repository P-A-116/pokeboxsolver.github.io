export interface GAConfig {
  DEFAULT_MUT_RATE: number;
  MIGRATION_FREQ: number;
  CHUNK_SIZE: number;
  STAGNATION_LIMIT: number;
  MCTS_ITERATIONS: number;
  HEURISTIC_THRESHOLD: number;
  TOURNAMENT_K: number;
}

export const GA_CONFIG: GAConfig = {
  DEFAULT_MUT_RATE:    0.15,
  MIGRATION_FREQ:      10,
  CHUNK_SIZE:          5,
  STAGNATION_LIMIT:    25,
  MCTS_ITERATIONS:     30,
  HEURISTIC_THRESHOLD: 0.35,
  TOURNAMENT_K:        4,
};

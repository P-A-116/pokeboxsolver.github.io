import { GA_CONFIG } from './config';
import { FitnessEvaluator } from './fitness';
import { GeneticAlgorithmEngine } from './ga-engine';
import { SeedMCTS } from './mcts';
import { typeAffinityScore } from './heuristics';
import type { AppealEffectsCache } from './appeal-cache';
import type { AppealPruner } from './appeal-pruner';
import type { SymmetryCache } from './symmetry';
import type { SeedEvaluationCache } from './seed-cache';

export interface PipelineMetrics {
  seedsEvaluated: number;
  pruned: number;
  stagnantGens: number;
}

export class HybridSearchPipeline {
  targets: string[];
  pool: string[];
  gaEngine: GeneticAlgorithmEngine;
  evaluator: FitnessEvaluator;
  metrics: PipelineMetrics;
  symCache?: SymmetryCache;
  pruner?: AppealPruner;
  seedCache?: SeedEvaluationCache;

  constructor(
    targets: string[],
    pool: string[],
    gaEngine: GeneticAlgorithmEngine,
    options?: {
      symCache?: SymmetryCache;
      pruner?: AppealPruner;
      seedCache?: SeedEvaluationCache;
      appealCache?: AppealEffectsCache;
    }
  ) {
    this.targets = targets;
    this.pool = pool;
    this.gaEngine = gaEngine;
    this.evaluator = new FitnessEvaluator(targets, options?.appealCache);
    this.metrics = { seedsEvaluated: 0, pruned: 0, stagnantGens: 0 };
    this.symCache = options?.symCache;
    this.pruner = options?.pruner;
    this.seedCache = options?.seedCache;
  }

  evaluateSeed(team: string[]): number {
    if (this.symCache) {
      const cached = this.symCache.get(team);
      if (cached !== undefined) return cached;
    }

    if (this.pruner) {
      const sig = this.pruner.getAppealSignature(team);
      if (this.pruner.seenAppealVectors.has(sig)) {
        this.metrics.pruned++;
        const rep = this.pruner.seenAppealVectors.get(sig);
        if (rep && this.symCache) {
          const repScore = this.symCache.get(rep);
          if (repScore !== undefined) return repScore;
        }
      } else {
        this.pruner.seenAppealVectors.set(sig, team);
      }
    }

    if (typeAffinityScore(team, this.targets) < GA_CONFIG.HEURISTIC_THRESHOLD) {
      if (this.symCache) this.symCache.set(team, -Infinity);
      return -Infinity;
    }

    this.metrics.seedsEvaluated++;
    const score = this.evaluator.score(team);
    if (this.symCache) this.symCache.set(team, score);
    if (this.seedCache) this.seedCache.set(team, score);
    return score;
  }

  runMCTS(seed: string[], iterations: number): string[] {
    if (!seed || this.pool.length <= seed.length) return seed;
    const mcts = new SeedMCTS(seed, this.targets, this.pool,
                              (s) => this.evaluateSeed(s));
    return mcts.search(iterations);
  }
}

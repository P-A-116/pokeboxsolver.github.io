// ── solver.js ─────────────────────────────────────────────────────────────
// Modular GA engine for the PokéBox Seed Solver.
// Provides: GA_CONFIG, FitnessEvaluator, GeneticAlgorithmEngine, HybridSearchPipeline.
// Extracted from index.html to separate concerns and enable easier tuning.

// ── GA Configuration ──────────────────────────────────────────────────────
// Centralised constants – adjust these to tune the search without touching logic.
const GA_CONFIG = {
  DEFAULT_MUT_RATE:    0.15,  // base mutation rate (decays over generations)
  MIGRATION_FREQ:      10,    // generations between island migrations
  CHUNK_SIZE:          5,     // generations per async UI-yield chunk
  STAGNATION_LIMIT:    25,    // consecutive stagnant gens before early stop
  MCTS_ITERATIONS:     30,    // MCTS rollouts per chunk
  HEURISTIC_THRESHOLD: 0.35,  // min typeAffinityScore before full evaluation
  TOURNAMENT_K:        4,     // tournament selection size
};

// ── Multi-Phase Fitness Evaluator ─────────────────────────────────────────
// Scores a team with a detailed breakdown across phases:
//   base      – per-Pokémon type-match contribution (compatible with prior scoring)
//   diversity – spread bonus for covering multiple target types
//   rarity    – bonus for legendary / mythical / gigantamax / baby classes
//   coverage  – breadth bonus for ratio of distinct target types covered
class FitnessEvaluator {
  constructor(targets) {
    this.targets   = targets;
    this.targetSet = new Set(targets);
  }

  // Return the combined scalar score.
  score(team) {
    return this.breakdown(team).total;
  }

  // Return a rich breakdown object (used for UI display and per-Pokémon scoring).
  breakdown(team) {
    const { targets, targetSet } = this;
    let baseScore = 0;
    const typeCoverage = {};
    const perPokemon   = [];

    for (const token of team) {
      const p = DB[token];
      if (!p) { perPokemon.push({ token, contrib: 0 }); continue; }

      // Use per-Pokémon appeal cache when available (avoids recomputing effects).
      if (typeof _appealCache !== 'undefined' && _appealCache) {
        const cached = _appealCache.getTokenContribution(token, targets);
        if (cached !== null) {
          baseScore += cached.contrib;
          for (const t of cached.coveredTypes) {
            typeCoverage[t] = (typeCoverage[t] || 0) + 1;
          }
          perPokemon.push({ token, contrib: cached.contrib });
          continue;
        }
      }

      const effects = p.se || [];
      let contrib = 0;

      if (effects.includes('repelAllVisitors')) {
        contrib = -5;
      } else if (p.lp === -1) {
        contrib = -3;
      } else {
        if (p.lp !== null && p.lp !== undefined) contrib += p.lp / 100;
        let typeContrib = 0;
        if (effects.includes('reverseTypeAppeal')) {
          for (const t of (p.t || [])) if (!targetSet.has(t)) typeContrib++;
        } else {
          for (const t of (p.t || [])) {
            if (targetSet.has(t)) {
              typeContrib++;
              typeCoverage[t] = (typeCoverage[t] || 0) + 1;
            }
          }
        }
        if (effects.includes('increaseSpecialVisitors')) typeContrib *= 1.5;
        contrib += typeContrib;
      }

      baseScore += contrib;
      perPokemon.push({ token, contrib });
    }

    // Phase 2: Diversity bonus – reward spreading coverage across target types.
    let diversityBonus = 0;
    for (const t of targets) {
      if (typeCoverage[t]) diversityBonus += Math.min(typeCoverage[t], 2) * 0.3;
    }

    // Phase 3: Rarity/class bonus – capped to prevent runaway inflation.
    let rarityBonus = 0;
    for (const token of team) {
      const p = DB[token]; if (!p) continue;
      switch (p.c) {
        case 'legendary':  rarityBonus += 0.5; break;
        case 'mythical':   rarityBonus += 0.4; break;
        case 'gigantamax': rarityBonus += 0.3; break;
        case 'baby':       rarityBonus += 0.2; break;
      }
    }
    rarityBonus = Math.min(rarityBonus, team.length * 0.5);

    // Phase 4: Coverage breadth – bonus for hitting more distinct target types.
    const uniqueCovered   = Object.keys(typeCoverage).filter(t => typeCoverage[t] > 0).length;
    const coverageBreadth = targets.length > 0
      ? (uniqueCovered / targets.length) * 0.5
      : 0;

    const total = baseScore + diversityBonus + rarityBonus + coverageBreadth;
    return {
      total,
      base:      baseScore,
      diversity: diversityBonus,
      rarity:    rarityBonus,
      coverage:  coverageBreadth,
      perPokemon,
      typeCoverage,
    };
  }
}

// Backward-compatible global wrapper so mcts.js and legacy callers still work.
function fitnessScore(team, targets) {
  return new FitnessEvaluator(targets).score(team);
}

// ── Utility Functions ─────────────────────────────────────────────────────

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sampleWithout(pool, n) {
  const copy = [...pool]; shuffle(copy);
  return copy.slice(0, Math.min(n, copy.length));
}

// ── Genetic Algorithm Engine ──────────────────────────────────────────────
class GeneticAlgorithmEngine {
  constructor(config = {}) {
    this.mutRate       = config.mutRate       || GA_CONFIG.DEFAULT_MUT_RATE;
    this.tournamentK   = config.tournamentK   || GA_CONFIG.TOURNAMENT_K;
    this.migrationFreq = config.migrationFreq || GA_CONFIG.MIGRATION_FREQ;
  }

  // Build initial islands with canonical deduplication to avoid wasting evaluations.
  initIslands(pool, popSize, teamSize, numIslands) {
    return Array.from({ length: numIslands }, () => {
      const seen = new Set();
      const pop  = [];
      let attempts = 0;
      const maxAttempts = popSize * 4;
      while (pop.length < popSize && attempts < maxAttempts) {
        attempts++;
        const candidate = sampleWithout(pool, teamSize);
        const key = [...candidate].sort().join(',');
        if (!seen.has(key)) { seen.add(key); pop.push(candidate); }
      }
      // Safety fill: add remaining slots without dedup when pool is very small.
      while (pop.length < popSize) pop.push(sampleWithout(pool, teamSize));
      return pop;
    });
  }

  adaptiveMutRate(gen, maxGens) {
    const t = gen / maxGens;
    return this.mutRate * (0.5 + 0.5 * (1 - t));
  }

  tournamentSelect(pop, scores) {
    const k = Math.min(this.tournamentK, pop.length);
    let best = null, bestScore = -Infinity;
    const used = new Set();
    while (used.size < k) {
      const i = Math.floor(Math.random() * pop.length);
      if (used.has(i)) continue;
      used.add(i);
      if (scores[i] > bestScore) { bestScore = scores[i]; best = pop[i]; }
    }
    return best;
  }

  crossover(a, b, pool) {
    const cut     = 1 + Math.floor(Math.random() * (a.length - 1));
    const headSet = new Set(a.slice(0, cut));
    const child   = [...a.slice(0, cut)];
    for (const g of b) if (!headSet.has(g)) child.push(g);
    if (child.length < a.length) {
      const childSet  = new Set(child);
      const remaining = pool.filter(g => !childSet.has(g));
      shuffle(remaining);
      child.push(...remaining.slice(0, a.length - child.length));
    }
    return child.slice(0, a.length);
  }

  mutate(team, pool, rate) {
    team = [...team];
    const teamSet = new Set(team);
    for (let i = 0; i < team.length; i++) {
      if (Math.random() < rate) {
        const candidates = pool.filter(g => !teamSet.has(g));
        if (candidates.length) {
          teamSet.delete(team[i]);
          team[i] = candidates[Math.floor(Math.random() * candidates.length)];
          teamSet.add(team[i]);
        }
      }
    }
    return team;
  }

  // Evolve a single island for one generation and return the new population.
  evolveIsland(pop, scores, pool, mutRate) {
    const nextPop = [];
    while (nextPop.length < pop.length) {
      const pa    = this.tournamentSelect(pop, scores);
      const pb    = this.tournamentSelect(pop, scores);
      let   child = this.crossover(pa, pb, pool);
      child = this.mutate(child, pool, mutRate);
      nextPop.push(child);
    }
    return nextPop;
  }
}

// ── Hybrid Search Pipeline ────────────────────────────────────────────────
// Orchestrates: heuristic pre-filter → GA generations → MCTS polish.
// Wraps the evaluation pipeline (symmetry cache → appeal pruner → heuristic → full eval)
// and exposes unified metrics.
class HybridSearchPipeline {
  constructor(targets, pool, gaEngine) {
    this.targets   = targets;
    this.pool      = pool;
    this.gaEngine  = gaEngine;
    this.evaluator = new FitnessEvaluator(targets);
    this.metrics   = { seedsEvaluated: 0, pruned: 0, stagnantGens: 0 };
  }

  // Evaluate a single team through the full caching/pruning pipeline.
  // Reads _symCache, _pruner from the global scope (set by startSolve).
  evaluateSeed(team) {
    // 1. Symmetry / order-invariant cache: return immediately if already evaluated.
    if (typeof _symCache !== 'undefined' && _symCache) {
      const cached = _symCache.get(team);
      if (cached !== undefined) return cached;
    }

    // 2. Appeal-space pruning: skip teams with an already-seen type distribution.
    if (typeof _pruner !== 'undefined' && _pruner) {
      const sig = _pruner.getAppealSignature(team);
      if (_pruner.seenAppealVectors.has(sig)) {
        this.metrics.pruned++;
        const rep = _pruner.seenAppealVectors.get(sig);
        if (rep && typeof _symCache !== 'undefined' && _symCache) {
          const repScore = _symCache.get(rep);
          if (repScore !== undefined) return repScore;
        }
      } else {
        _pruner.seenAppealVectors.set(sig, team);
      }
    }

    // 3. Heuristic pre-filter: reject obviously poor seeds before full evaluation.
    if (typeAffinityScore(team, this.targets) < GA_CONFIG.HEURISTIC_THRESHOLD) {
      if (typeof _symCache !== 'undefined' && _symCache) _symCache.set(team, -Infinity);
      return -Infinity;
    }

    // 4. Full multi-phase evaluation.
    this.metrics.seedsEvaluated++;
    const score = this.evaluator.score(team);
    if (typeof _symCache !== 'undefined' && _symCache) _symCache.set(team, score);
    if (typeof _seedCache !== 'undefined' && _seedCache) _seedCache.set(team, score);
    return score;
  }

  // Run MCTS local search starting from a candidate seed.
  runMCTS(seed, iterations) {
    if (!seed || this.pool.length <= seed.length) return seed;
    const mcts = new SeedMCTS(seed, this.targets, this.pool,
                              (s) => this.evaluateSeed(s));
    return mcts.search(iterations);
  }
}

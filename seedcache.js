// ── Seed Evaluation Cache ──────────────────────────────────────────────────
// Caches the fitness score for each unique team composition.
// Teams are order-invariant: [A,B,C] and [C,A,B] share the same cache entry.

class SeedEvaluationCache {
  constructor() {
    this.cache = new Map();
    this.hits  = 0;
    this.total = 0;
  }

  // Sort tokens so order doesn't matter
  cacheKey(seed) {
    return [...seed].sort().join(',');
  }

  has(seed) {
    return this.cache.has(this.cacheKey(seed));
  }

  get(seed) {
    this.total++;
    const val = this.cache.get(this.cacheKey(seed));
    if (val !== undefined) { this.hits++; return val; }
    return undefined;
  }

  set(seed, result) {
    this.cache.set(this.cacheKey(seed), result);
  }

  get hitRate() {
    return this.total === 0 ? 0 : this.hits / this.total;
  }

  get size() {
    return this.cache.size;
  }

  clear() {
    this.cache.clear();
    this.hits  = 0;
    this.total = 0;
  }
}

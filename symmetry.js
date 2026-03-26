// ── Symmetry Detection & Canonical Forms ──────────────────────────────────
// Treats teams as sets (order-invariant) and deduplicates by canonical key.
// Distinct Pokémon with identical type profiles (and no special effects) are
// considered equivalent for fitness purposes; only one representative is kept.

// Return the canonical key for a seed: sorted tokens joined by commas.
// This is the simplest and most accurate form – it guarantees that [A,B,C]
// and [C,A,B] share the same key without any lossy approximation.
function canonicalizeSeed(seed) {
  return [...seed].sort().join(',');
}

// Cache that maps canonical seed keys to their evaluated fitness score.
class SymmetryCache {
  constructor() {
    this.evaluated = new Map(); // canonical key → score
    this.hits  = 0;
    this.total = 0;
  }

  has(seed) {
    return this.evaluated.has(canonicalizeSeed(seed));
  }

  get(seed) {
    this.total++;
    const key = canonicalizeSeed(seed);
    if (this.evaluated.has(key)) {
      this.hits++;
      return this.evaluated.get(key);
    }
    return undefined;
  }

  set(seed, score) {
    this.evaluated.set(canonicalizeSeed(seed), score);
  }

  get hitRate() {
    return this.total === 0 ? 0 : this.hits / this.total;
  }

  get size() {
    return this.evaluated.size;
  }

  clear() {
    this.evaluated.clear();
    this.hits  = 0;
    this.total = 0;
  }
}

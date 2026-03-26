// ── Appeal-Space Pruner ────────────────────────────────────────────────────
// Skips seeds whose type-appeal signature has already been explored.
// Two seeds with the same type distribution tend to produce the same fitness,
// so evaluating the second one is redundant.

class AppealPruner {
  constructor() {
    this.seenAppealVectors = new Map(); // sig → first seed that produced it
    this.pruned = 0;
  }

  // Build a normalized type-distribution signature for a seed.
  // Values are bucketed to 10% resolution to collapse near-duplicates.
  getAppealSignature(seed) {
    const typeCounts = {};
    for (const token of seed) {
      const p = DB[token];
      if (!p) continue;
      for (const t of (p.t || [])) {
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }
    }
    const total = seed.length || 1;
    return Object.entries(typeCounts)
      .map(([t, v]) => `${t}:${Math.round((v / total) * 10)}`)
      .sort()
      .join('|');
  }

  // Returns true if this seed should be evaluated (novel appeal vector).
  shouldEvaluate(seed) {
    const sig = this.getAppealSignature(seed);
    if (this.seenAppealVectors.has(sig)) {
      this.pruned++;
      return false;
    }
    this.seenAppealVectors.set(sig, seed);
    return true;
  }

  reset() {
    this.seenAppealVectors.clear();
    this.pruned = 0;
  }
}

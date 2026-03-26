// ── Appeal Effects Cache ───────────────────────────────────────────────────
// Caches the per-Pokémon type contribution for a given set of targets.
// Since DB entries and target types are static per run, this is fully deterministic.

class AppealEffectsCache {
  constructor() {
    this.cache = new Map();
    this.hits  = 0;
    this.total = 0;
  }

  // Returns { contrib: number, coveredTypes: string[] } for one token against targets.
  // Null if the token is unknown.
  getTokenContribution(token, targets) {
    // Sort targets once per call so insertion order doesn't create phantom cache misses.
    const targetKey = [...targets].sort().join(',');
    const key       = token + '|' + targetKey;
    this.total++;

    if (this.cache.has(key)) {
      this.hits++;
      return this.cache.get(key);
    }

    const p = DB[token];
    if (!p) { this.cache.set(key, null); return null; }

    const targetSet    = new Set(targets);
    const effects      = p.se || [];
    const types        = p.t  || [];
    const coveredTypes = [];
    let contrib        = 0;

    if (effects.includes('repelAllVisitors')) {
      contrib = -5;
    } else if (p.lp === -1) {
      contrib = -3;
    } else {
      if (p.lp !== null && p.lp !== undefined) contrib += p.lp / 100;

      let typeContrib = 0;
      if (effects.includes('reverseTypeAppeal')) {
        for (const t of types) if (!targetSet.has(t)) typeContrib++;
      } else {
        for (const t of types) {
          if (targetSet.has(t)) { typeContrib++; coveredTypes.push(t); }
        }
      }
      if (effects.includes('increaseSpecialVisitors')) typeContrib *= 1.5;
      contrib += typeContrib;
    }

    const result = { contrib, coveredTypes };
    this.cache.set(key, result);
    return result;
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

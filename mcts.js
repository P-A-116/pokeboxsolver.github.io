// ── Monte Carlo Tree Search – Seed Space Explorer ─────────────────────────
// Replaces purely random GA mutation with UCB-guided exploration.
// Each node represents a seed; children are single-Pokémon substitutions.

class SeedMCTSNode {
  constructor(seed, parent = null) {
    this.seed     = seed;
    this.parent   = parent;
    this.children = new Map(); // key → SeedMCTSNode
    this.visits   = 0;
    this.value    = 0;
    this._untried = null; // lazily populated
  }

  // Lazily build the list of untried single-swap mutations.
  // To keep memory bounded we sample at most MAX_CANDIDATES per position.
  _getUntried(pool) {
    if (this._untried !== null) return this._untried;
    const MAX_CANDIDATES = 15;
    const seedSet        = new Set(this.seed);
    const candidates     = pool.filter(g => !seedSet.has(g));
    // Shuffle once so the first MAX_CANDIDATES are random
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const sample  = candidates.slice(0, MAX_CANDIDATES);
    this._untried = [];
    for (let i = 0; i < this.seed.length; i++) {
      for (const c of sample) {
        const mutated = [...this.seed];
        mutated[i]    = c;
        this._untried.push(mutated);
      }
    }
    return this._untried;
  }

  ucb(c = 1.41) {
    if (this.visits === 0) return Infinity;
    return (this.value / this.visits) +
           c * Math.sqrt(Math.log(this.parent.visits) / this.visits);
  }

  selectBestChild() {
    let best = null, bestUCB = -Infinity;
    for (const child of this.children.values()) {
      const u = child.ucb();
      if (u > bestUCB) { bestUCB = u; best = child; }
    }
    return best;
  }

  // Add one randomly chosen untried mutation as a child node.
  expand(pool) {
    const untried = this._getUntried(pool);
    if (untried.length === 0) return this;
    const idx      = Math.floor(Math.random() * untried.length);
    const mutation = untried.splice(idx, 1)[0];
    const child    = new SeedMCTSNode(mutation, this);
    this.children.set(mutation.join(','), child);
    return child;
  }

  // Propagate value up the tree.
  backup(value) {
    let node = this;
    while (node !== null) {
      node.visits++;
      node.value += value;
      node = node.parent;
    }
  }
}

// ── MCTS Controller ─────────────────────────────────────────────────────────
class SeedMCTS {
  // evalFn: optional (seed) => score function; defaults to fitnessScore(seed, targets).
  constructor(initialSeed, targets, pool, evalFn = null) {
    this.root       = new SeedMCTSNode(initialSeed);
    this.targets    = targets;
    this.pool       = pool;
    this._evalFn    = evalFn;
    this._evalCache = new Map();
    this.evaluations = 0;
  }

  // Run `iterations` MCTS rollouts and return the best neighbouring seed found.
  search(iterations, maxDepth = 3) {
    for (let i = 0; i < iterations; i++) {
      let node  = this.root;
      let depth = 0;

      // Selection: follow best children until a leaf or depth limit
      while (
        node.children.size > 0 &&
        (node._untried === null || node._untried.length === 0) &&
        depth < maxDepth
      ) {
        const next = node.selectBestChild();
        if (!next) break;
        node = next;
        depth++;
      }

      // Expansion: add one new child if possible
      if (depth < maxDepth) {
        node = node.expand(this.pool);
      }

      // Simulation: evaluate the leaf seed
      const value = this._evaluate(node.seed);

      // Backup
      node.backup(value);
    }

    // Return the seed of the most-visited child (more robust than best UCB)
    let best = null, bestVisits = -1;
    for (const child of this.root.children.values()) {
      if (child.visits > bestVisits) { bestVisits = child.visits; best = child; }
    }
    return best ? best.seed : this.root.seed;
  }

  _evaluate(seed) {
    // Use the custom evaluator when provided (e.g. _evaluateSeed from the main GA loop),
    // so MCTS benefits from the same caching and pruning infrastructure.
    if (this._evalFn) return this._evalFn(seed);

    // Fallback: own local cache + direct fitnessScore call.
    const key = [...seed].sort().join(',');
    if (this._evalCache.has(key)) return this._evalCache.get(key);
    this.evaluations++;
    const value = fitnessScore(seed, this.targets);
    this._evalCache.set(key, value);
    return value;
  }
}

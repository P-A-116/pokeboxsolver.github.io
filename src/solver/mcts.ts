import { fitnessScore } from './fitness';

export class SeedMCTSNode {
  seed: string[];
  parent: SeedMCTSNode | null;
  children: Map<string, SeedMCTSNode>;
  visits: number;
  value: number;
  _untried: string[][] | null;

  constructor(seed: string[], parent: SeedMCTSNode | null = null) {
    this.seed = seed;
    this.parent = parent;
    this.children = new Map();
    this.visits = 0;
    this.value = 0;
    this._untried = null;
  }

  _getUntried(pool: string[]): string[][] {
    if (this._untried !== null) return this._untried;
    const MAX_CANDIDATES = 15;
    const seedSet = new Set(this.seed);
    const candidates = pool.filter(g => !seedSet.has(g));
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const sample = candidates.slice(0, MAX_CANDIDATES);
    this._untried = [];
    for (let i = 0; i < this.seed.length; i++) {
      for (const c of sample) {
        const mutated = [...this.seed];
        mutated[i] = c;
        this._untried.push(mutated);
      }
    }
    return this._untried;
  }

  ucb(c = 1.41): number {
    if (this.visits === 0) return Infinity;
    return (this.value / this.visits) +
           c * Math.sqrt(Math.log(this.parent!.visits) / this.visits);
  }

  selectBestChild(): SeedMCTSNode | null {
    let best: SeedMCTSNode | null = null;
    let bestUCB = -Infinity;
    for (const child of this.children.values()) {
      const u = child.ucb();
      if (u > bestUCB) { bestUCB = u; best = child; }
    }
    return best;
  }

  expand(pool: string[]): SeedMCTSNode {
    const untried = this._getUntried(pool);
    if (untried.length === 0) return this;
    const idx = Math.floor(Math.random() * untried.length);
    const mutation = untried.splice(idx, 1)[0];
    const child = new SeedMCTSNode(mutation, this);
    this.children.set(mutation.join(','), child);
    return child;
  }

  backup(value: number): void {
    let node: SeedMCTSNode | null = this;
    while (node !== null) {
      node.visits++;
      node.value += value;
      node = node.parent;
    }
  }
}

export class SeedMCTS {
  private root: SeedMCTSNode;
  private targets: string[];
  private pool: string[];
  private _evalFn: ((seed: string[]) => number) | null;
  private _evalCache: Map<string, number>;
  evaluations: number;

  constructor(
    initialSeed: string[],
    targets: string[],
    pool: string[],
    evalFn: ((seed: string[]) => number) | null = null
  ) {
    this.root = new SeedMCTSNode(initialSeed);
    this.targets = targets;
    this.pool = pool;
    this._evalFn = evalFn;
    this._evalCache = new Map();
    this.evaluations = 0;
  }

  search(iterations: number, maxDepth = 3): string[] {
    for (let i = 0; i < iterations; i++) {
      let node = this.root;
      let depth = 0;
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
      if (depth < maxDepth) {
        node = node.expand(this.pool);
      }
      const value = this._evaluate(node.seed);
      node.backup(value);
    }
    let best: SeedMCTSNode | null = null;
    let bestVisits = -1;
    for (const child of this.root.children.values()) {
      if (child.visits > bestVisits) { bestVisits = child.visits; best = child; }
    }
    return best ? best.seed : this.root.seed;
  }

  private _evaluate(seed: string[]): number {
    if (this._evalFn) return this._evalFn(seed);
    const key = [...seed].sort().join(',');
    if (this._evalCache.has(key)) return this._evalCache.get(key)!;
    this.evaluations++;
    const value = fitnessScore(seed, this.targets);
    this._evalCache.set(key, value);
    return value;
  }
}

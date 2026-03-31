export function canonicalizeSeed(seed: string[]): string {
  return [...seed].sort().join(',');
}

export class SymmetryCache {
  private evaluated: Map<string, number> = new Map();
  hits = 0;
  total = 0;

  has(seed: string[]): boolean { return this.evaluated.has(canonicalizeSeed(seed)); }
  get(seed: string[]): number | undefined {
    this.total++;
    const key = canonicalizeSeed(seed);
    if (this.evaluated.has(key)) { this.hits++; return this.evaluated.get(key); }
    return undefined;
  }
  set(seed: string[], score: number): void { this.evaluated.set(canonicalizeSeed(seed), score); }
  get hitRate(): number { return this.total === 0 ? 0 : this.hits / this.total; }
  get size(): number { return this.evaluated.size; }
  clear(): void { this.evaluated.clear(); this.hits = 0; this.total = 0; }
}

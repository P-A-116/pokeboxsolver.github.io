import { canonicalizeSeed } from './symmetry';

export class SeedEvaluationCache {
  private cache: Map<string, number> = new Map();
  hits = 0;
  total = 0;

  cacheKey(seed: string[]): string { return canonicalizeSeed(seed); }
  has(seed: string[]): boolean { return this.cache.has(this.cacheKey(seed)); }
  get(seed: string[]): number | undefined {
    this.total++;
    const val = this.cache.get(this.cacheKey(seed));
    if (val !== undefined) { this.hits++; return val; }
    return undefined;
  }
  set(seed: string[], result: number): void { this.cache.set(this.cacheKey(seed), result); }
  get hitRate(): number { return this.total === 0 ? 0 : this.hits / this.total; }
  get size(): number { return this.cache.size; }
  clear(): void { this.cache.clear(); this.hits = 0; this.total = 0; }
}

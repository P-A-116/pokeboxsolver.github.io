import { DB } from '../data/db';

export type TokenContribution = { contrib: number; coveredTypes: string[] } | null;

export class AppealEffectsCache {
  private cache: Map<string, TokenContribution> = new Map();
  hits = 0;
  total = 0;

  getTokenContribution(token: string, targets: string[]): TokenContribution {
    const targetKey = [...targets].sort().join(',');
    const key = token + '|' + targetKey;
    this.total++;

    if (this.cache.has(key)) {
      this.hits++;
      return this.cache.get(key)!;
    }

    const p = DB[token];
    if (!p) { this.cache.set(key, null); return null; }

    const targetSet = new Set(targets);
    const effects = p.se || [];
    const types = p.t || [];
    const coveredTypes: string[] = [];
    let contrib = 0;

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

    const result: TokenContribution = { contrib, coveredTypes };
    this.cache.set(key, result);
    return result;
  }

  get hitRate(): number { return this.total === 0 ? 0 : this.hits / this.total; }
  get size(): number { return this.cache.size; }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.total = 0;
  }
}

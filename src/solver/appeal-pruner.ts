import { DB } from '../data/db';

export class AppealPruner {
  seenAppealVectors: Map<string, string[]> = new Map();
  pruned = 0;

  getAppealSignature(seed: string[]): string {
    const typeCounts: Record<string, number> = {};
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

  shouldEvaluate(seed: string[]): boolean {
    const sig = this.getAppealSignature(seed);
    if (this.seenAppealVectors.has(sig)) {
      this.pruned++;
      return false;
    }
    this.seenAppealVectors.set(sig, seed);
    return true;
  }

  reset(): void {
    this.seenAppealVectors.clear();
    this.pruned = 0;
  }
}

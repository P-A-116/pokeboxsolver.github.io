import { GA_CONFIG } from './config';

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function sampleWithout(pool: string[], n: number): string[] {
  const copy = [...pool]; shuffle(copy);
  return copy.slice(0, Math.min(n, copy.length));
}

export class GeneticAlgorithmEngine {
  private mutRate: number;
  private tournamentK: number;
  private migrationFreq: number;

  constructor(config: Partial<{ mutRate: number; tournamentK: number; migrationFreq: number }> = {}) {
    this.mutRate       = config.mutRate       ?? GA_CONFIG.DEFAULT_MUT_RATE;
    this.tournamentK   = config.tournamentK   ?? GA_CONFIG.TOURNAMENT_K;
    this.migrationFreq = config.migrationFreq ?? GA_CONFIG.MIGRATION_FREQ;
  }

  initIslands(pool: string[], popSize: number, teamSize: number, numIslands: number): string[][][] {
    return Array.from({ length: numIslands }, () => {
      const seen = new Set<string>();
      const pop: string[][] = [];
      let attempts = 0;
      const maxAttempts = popSize * 4;
      while (pop.length < popSize && attempts < maxAttempts) {
        attempts++;
        const candidate = sampleWithout(pool, teamSize);
        const key = [...candidate].sort().join(',');
        if (!seen.has(key)) { seen.add(key); pop.push(candidate); }
      }
      while (pop.length < popSize) pop.push(sampleWithout(pool, teamSize));
      return pop;
    });
  }

  adaptiveMutRate(gen: number, maxGens: number): number {
    const t = gen / maxGens;
    return this.mutRate * (0.5 + 0.5 * (1 - t));
  }

  tournamentSelect(pop: string[][], scores: number[]): string[] {
    const k = Math.min(this.tournamentK, pop.length);
    let best: string[] | null = null;
    let bestScore = -Infinity;
    const used = new Set<number>();
    while (used.size < k) {
      const i = Math.floor(Math.random() * pop.length);
      if (used.has(i)) continue;
      used.add(i);
      if (scores[i] > bestScore) { bestScore = scores[i]; best = pop[i]; }
    }
    return best!;
  }

  crossover(a: string[], b: string[], pool: string[]): string[] {
    const cut = 1 + Math.floor(Math.random() * (a.length - 1));
    const headSet = new Set(a.slice(0, cut));
    const child = [...a.slice(0, cut)];
    for (const g of b) if (!headSet.has(g)) child.push(g);
    if (child.length < a.length) {
      const childSet = new Set(child);
      const remaining = pool.filter(g => !childSet.has(g));
      shuffle(remaining);
      child.push(...remaining.slice(0, a.length - child.length));
    }
    return child.slice(0, a.length);
  }

  mutate(team: string[], pool: string[], rate: number): string[] {
    team = [...team];
    const teamSet = new Set(team);
    for (let i = 0; i < team.length; i++) {
      if (Math.random() < rate) {
        const candidates = pool.filter(g => !teamSet.has(g));
        if (candidates.length) {
          teamSet.delete(team[i]);
          team[i] = candidates[Math.floor(Math.random() * candidates.length)];
          teamSet.add(team[i]);
        }
      }
    }
    return team;
  }

  evolveIsland(pop: string[][], scores: number[], pool: string[], mutRate: number): string[][] {
    const nextPop: string[][] = [];
    while (nextPop.length < pop.length) {
      const pa = this.tournamentSelect(pop, scores);
      const pb = this.tournamentSelect(pop, scores);
      let child = this.crossover(pa, pb, pool);
      child = this.mutate(child, pool, mutRate);
      nextPop.push(child);
    }
    return nextPop;
  }
}

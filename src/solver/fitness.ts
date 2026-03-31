import { DB } from '../data/db';
import type { AppealEffectsCache } from './appeal-cache';

export interface PerPokemonScore {
  token: string;
  contrib: number;
}

export interface FitnessBreakdown {
  total: number;
  base: number;
  diversity: number;
  rarity: number;
  coverage: number;
  perPokemon: PerPokemonScore[];
  typeCoverage: Record<string, number>;
}

export class FitnessEvaluator {
  private targets: string[];
  private targetSet: Set<string>;
  private appealCache?: AppealEffectsCache;

  constructor(targets: string[], appealCache?: AppealEffectsCache) {
    this.targets = targets;
    this.targetSet = new Set(targets);
    this.appealCache = appealCache;
  }

  score(team: string[]): number {
    return this.breakdown(team).total;
  }

  breakdown(team: string[]): FitnessBreakdown {
    const { targets, targetSet } = this;
    let baseScore = 0;
    const typeCoverage: Record<string, number> = {};
    const perPokemon: PerPokemonScore[] = [];

    for (const token of team) {
      const p = DB[token];
      if (!p) { perPokemon.push({ token, contrib: 0 }); continue; }

      if (this.appealCache) {
        const cached = this.appealCache.getTokenContribution(token, targets);
        if (cached !== null) {
          baseScore += cached.contrib;
          for (const t of cached.coveredTypes) {
            typeCoverage[t] = (typeCoverage[t] || 0) + 1;
          }
          perPokemon.push({ token, contrib: cached.contrib });
          continue;
        }
      }

      const effects = p.se || [];
      let contrib = 0;

      if (effects.includes('repelAllVisitors')) {
        contrib = -5;
      } else if (p.lp === -1) {
        contrib = -3;
      } else {
        if (p.lp !== null && p.lp !== undefined) contrib += p.lp / 100;
        let typeContrib = 0;
        if (effects.includes('reverseTypeAppeal')) {
          for (const t of (p.t || [])) if (!targetSet.has(t)) typeContrib++;
        } else {
          for (const t of (p.t || [])) {
            if (targetSet.has(t)) {
              typeContrib++;
              typeCoverage[t] = (typeCoverage[t] || 0) + 1;
            }
          }
        }
        if (effects.includes('increaseSpecialVisitors')) typeContrib *= 1.5;
        contrib += typeContrib;
      }

      baseScore += contrib;
      perPokemon.push({ token, contrib });
    }

    let diversityBonus = 0;
    for (const t of targets) {
      if (typeCoverage[t]) diversityBonus += Math.min(typeCoverage[t], 2) * 0.3;
    }

    let rarityBonus = 0;
    for (const token of team) {
      const p = DB[token]; if (!p) continue;
      switch (p.c) {
        case 'legendary':  rarityBonus += 0.5; break;
        case 'mythical':   rarityBonus += 0.4; break;
        case 'gigantamax': rarityBonus += 0.3; break;
        case 'baby':       rarityBonus += 0.2; break;
      }
    }
    rarityBonus = Math.min(rarityBonus, team.length * 0.5);

    const uniqueCovered = Object.keys(typeCoverage).filter(t => typeCoverage[t] > 0).length;
    const coverageBreadth = targets.length > 0
      ? (uniqueCovered / targets.length) * 0.5
      : 0;

    const total = baseScore + diversityBonus + rarityBonus + coverageBreadth;
    return {
      total,
      base: baseScore,
      diversity: diversityBonus,
      rarity: rarityBonus,
      coverage: coverageBreadth,
      perPokemon,
      typeCoverage,
    };
  }
}

export function fitnessScore(team: string[], targets: string[]): number {
  return new FitnessEvaluator(targets).score(team);
}

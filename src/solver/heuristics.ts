import { DB } from '../data/db';
import { GA_CONFIG } from './config';

export const HEURISTIC_THRESHOLD = GA_CONFIG.HEURISTIC_THRESHOLD;

export const ATTRACTS: Record<string, string[]> = {
  fire:     ['water', 'ground'],
  water:    ['electric', 'grass'],
  electric: ['water', 'ground'],
  grass:    ['water', 'rock'],
  rock:     ['ground', 'steel'],
  ground:   ['fire', 'rock'],
  steel:    ['electric', 'ice'],
  ice:      ['fire', 'steel'],
  dragon:   ['dragon', 'fairy'],
  fairy:    ['dragon', 'fighting'],
  fighting: ['psychic', 'dark'],
  psychic:  ['ghost', 'dark'],
  ghost:    ['normal', 'psychic'],
  dark:     ['ghost', 'fighting'],
  normal:   ['fighting'],
  flying:   ['electric', 'ice', 'rock'],
  bug:      ['fire', 'flying', 'rock'],
  poison:   ['ground', 'psychic'],
};

export function checkAttraction(seed: string[], targets: string[]): boolean {
  const targetSet = new Set(targets);
  for (const token of seed) {
    const p = DB[token];
    if (!p) continue;
    const primaryType = (p.t || [])[0];
    if (!primaryType) continue;
    const attracted = ATTRACTS[primaryType] || [];
    for (const t of attracted) {
      if (targetSet.has(t)) return true;
    }
  }
  return false;
}

export function typeAffinityScore(seed: string[], targets: string[]): number {
  const targetSet = new Set(targets);
  const typesHit = new Set<string>();
  for (const token of seed) {
    const p = DB[token];
    if (!p) continue;
    for (const t of (p.t || [])) {
      if (targetSet.has(t)) typesHit.add(t);
    }
  }
  const targetCoverage = typesHit.size / (targets.length || 1);
  const typeCounts: Record<string, number> = {};
  for (const token of seed) {
    const p = DB[token];
    if (!p) continue;
    const primary = (p.t || [])[0];
    if (primary) typeCounts[primary] = (typeCounts[primary] || 0) + 1;
  }
  const typeCountValues = Object.values(typeCounts);
  const maxCount = typeCountValues.length > 0 ? Math.max(...typeCountValues) : 0;
  const balance  = 1 - (maxCount / (seed.length || 1));
  const chains = checkAttraction(seed, targets) ? 1 : 0;
  const dualCount = seed.filter(token => {
    const p = DB[token];
    return p && (p.t || []).length > 1;
  }).length;
  const dualBonus = dualCount / (seed.length || 1);
  return (0.4 * targetCoverage) + (0.3 * balance) + (0.2 * chains) + (0.1 * dualBonus);
}

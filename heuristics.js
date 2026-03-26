// ── Type Diversity Heuristic (Pre-Filter) ─────────────────────────────────
// Fast O(team_size) score in [0, 1].  Seeds below HEURISTIC_THRESHOLD are
// rejected before the full fitness evaluation, saving significant compute.

const HEURISTIC_THRESHOLD = 0.35;

// Pokémon-type attraction chains (which types "attract" or complement others).
const ATTRACTS = {
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

// Returns true if any Pokémon in the seed has a primary type that attracts
// at least one of the field's target types.
function checkAttraction(seed, targets) {
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

// Heuristic fitness in [0, 1].  No simulation – runs in ~O(team_size).
function typeAffinityScore(seed, targets) {
  const targetSet = new Set(targets);

  // 1. Target coverage: how many target types are represented?
  const typesHit = new Set();
  for (const token of seed) {
    const p = DB[token];
    if (!p) continue;
    for (const t of (p.t || [])) {
      if (targetSet.has(t)) typesHit.add(t);
    }
  }
  const targetCoverage = typesHit.size / (targets.length || 1);

  // 2. Primary-type balance: penalise seeds dominated by a single type.
  const typeCounts = {};
  for (const token of seed) {
    const p = DB[token];
    if (!p) continue;
    const primary = (p.t || [])[0];
    if (primary) typeCounts[primary] = (typeCounts[primary] || 0) + 1;
  }
  const typeCountValues = Object.values(typeCounts);
  const maxCount = typeCountValues.length > 0 ? Math.max(...typeCountValues) : 0;
  const balance  = 1 - (maxCount / (seed.length || 1));

  // 3. Attraction chains with target types.
  const chains = checkAttraction(seed, targets) ? 1 : 0;

  // 4. Dual-type bonus (more diverse coverage paths).
  const dualCount = seed.filter(token => {
    const p = DB[token];
    return p && (p.t || []).length > 1;
  }).length;
  const dualBonus = dualCount / (seed.length || 1);

  return (0.4 * targetCoverage) + (0.3 * balance) + (0.2 * chains) + (0.1 * dualBonus);
}

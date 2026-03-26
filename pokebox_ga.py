import random
import math
from typing import List

DEFAULT_MUT_RATE = 0.15
ISLAND_COUNT     = 3
MIGRATION_FREQ   = 10  # generations between migration

def adaptive_mutation_rate(gen: int, max_gens: int, base=DEFAULT_MUT_RATE) -> float:
    t = gen / max_gens
    return base * (0.5 + 0.5 * (1 - t))

def tournament_select(pop: List[list], scores: List[float], k=4) -> list:
    k = min(k, len(pop))
    return max(random.sample(list(zip(scores, pop)), k), key=lambda x: x[0])[1]

def crossover(a: list, b: list, pool: list) -> list:
    cut = random.randint(1, len(a) - 1)
    child = a[:cut] + [g for g in b if g not in a[:cut]]
    # BUG FIX: avoid infinite loop when pool is small — collect remaining
    # candidates up front instead of retrying random.choice indefinitely
    remaining = [g for g in pool if g not in child]
    random.shuffle(remaining)
    child += remaining[:len(a) - len(child)]
    return child

def mutate(team: list, pool: list, rate: float) -> list:
    team = list(team)
    for i in range(len(team)):
        if random.random() < rate:
            candidates = [g for g in pool if g not in team]
            if candidates:
                team[i] = random.choice(candidates)
    return team

def island_ga(pool, targets, pop_size, generations, fitness_fn, team_size):
    islands = [
        [random.sample(pool, min(len(pool), team_size)) for _ in range(pop_size)]
        for _ in range(ISLAND_COUNT)
    ]
    best_overall, best_score = None, -math.inf

    for gen in range(1, generations + 1):
        for idx, pop in enumerate(islands):
            mut_rate = adaptive_mutation_rate(gen, generations)
            scores = [fitness_fn(t, targets) for t in pop]

            # track best
            best_idx = max(range(len(scores)), key=lambda i: scores[i])
            if scores[best_idx] > best_score:
                best_score = scores[best_idx]
                best_overall = list(pop[best_idx])

            # generate next population (always exactly pop_size individuals)
            next_pop = []
            while len(next_pop) < pop_size:
                parent_a = tournament_select(pop, scores)
                parent_b = tournament_select(pop, scores)
                child = crossover(parent_a, parent_b, pool)
                child = mutate(child, pool, mut_rate)
                next_pop.append(child)
            islands[idx] = next_pop

        # BUG FIX: migration replaces a random individual instead of appending,
        # keeping each island at a constant pop_size
        if gen % MIGRATION_FREQ == 0:
            migrants = [random.choice(islands[i]) for i in range(ISLAND_COUNT)]
            for i in range(ISLAND_COUNT):
                replace_idx = random.randrange(len(islands[(i + 1) % ISLAND_COUNT]))
                islands[(i + 1) % ISLAND_COUNT][replace_idx] = migrants[i]

        yield gen, best_score, best_overall

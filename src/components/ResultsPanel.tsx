import { Show, For } from 'solid-js';
import { DB } from '../data/db';
import type { FitnessBreakdown } from '../solver/fitness';
import { PokeCard } from './PokeCard';
import { AppealChart } from './AppealChart';

interface ResultsState {
  team: string[];
  score: number;
  targets: string[];
  breakdown: FitnessBreakdown;
}

interface ResultsPanelProps {
  results: ResultsState | null;
}

function appealChartData(team: string[], targets: string[]): { labels: string[]; values: number[] } {
  const targetSet = new Set(targets);
  const typeScores: Record<string, number> = {};
  for (const t of targets) typeScores[t] = 0;
  for (const token of team) {
    const p = DB[token]; if (!p) continue;
    const effects = p.se || [];
    if (effects.includes('repelAllVisitors')) continue;
    for (const t of (p.t || [])) {
      if (targetSet.has(t)) typeScores[t] = (typeScores[t] || 0) + 1;
    }
  }
  const labels = Object.keys(typeScores);
  const values = labels.map(l => typeScores[l]);
  return { labels, values };
}

export function ResultsPanel(props: ResultsPanelProps) {
  return (
    <Show when={props.results}>
      {r => {
        const res = r();
        const { team, score, targets, breakdown } = res;
        const chartData = appealChartData(team, targets);
        return (
          <div class="panel">
            <div class="panel-title">Best Team</div>
            <div id="final-score">
              FITNESS {score.toFixed(2)}  //  {team.length} POKÉMON  //  FIELD MATCH
            </div>
            <div class="score-breakdown">
              <div class="sb-item">Base <span>{breakdown.base.toFixed(1)}</span></div>
              <div class="sb-item">Diversity <span>+{breakdown.diversity.toFixed(1)}</span></div>
              <div class="sb-item">Rarity <span>+{breakdown.rarity.toFixed(1)}</span></div>
              <div class="sb-item">Coverage <span>+{breakdown.coverage.toFixed(1)}</span></div>
            </div>
            <div class="team-grid">
              <For each={team}>{token =>
                <PokeCard token={token} targets={targets} />
              }</For>
            </div>
            <Show when={chartData.labels.length > 0}>
              <AppealChart labels={chartData.labels} values={chartData.values} />
            </Show>
          </div>
        );
      }}
    </Show>
  );
}

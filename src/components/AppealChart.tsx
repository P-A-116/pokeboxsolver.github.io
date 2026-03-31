import { For } from 'solid-js';

const TYPE_COLORS: Record<string, string> = {
  fire:'#b22222', water:'#1565c0', grass:'#2e7d32', electric:'#c6a800',
  ice:'#00838f', fighting:'#7b1c00', poison:'#6a1b9a', ground:'#8d6e36',
  flying:'#1976d2', psychic:'#ad1457', bug:'#558b2f', rock:'#6d4c41',
  ghost:'#4527a0', dragon:'#283593', dark:'#212121', steel:'#455a64',
  fairy:'#c2185b', normal:'#546e7a',
};

interface AppealChartProps {
  labels: string[];
  values: number[];
}

export function AppealChart(props: AppealChartProps) {
  const maxVal = () => props.values.reduce((a, b) => Math.max(a, b), 1);

  return (
    <div id="chart-wrap">
      <h3>TYPE APPEAL BREAKDOWN</h3>
      <div class="bar-chart">
        <For each={props.labels}>{(lbl, i) => {
          const pct = () => Math.round((props.values[i()] / maxVal()) * 100);
          const color = TYPE_COLORS[lbl] || '#555';
          return (
            <div class="bar-row">
              <span class="bar-label">{lbl}</span>
              <div class="bar-fill-wrap">
                <div class="bar-fill" style={{ width: pct() + '%', background: color }}></div>
              </div>
              <span class="bar-val">{props.values[i()]}</span>
            </div>
          );
        }}</For>
      </div>
    </div>
  );
}

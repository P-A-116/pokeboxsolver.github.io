import { For, Show } from 'solid-js';
import { FIELDS } from '../data/fields';

interface ConfigPanelProps {
  field: string;
  evoStage: string;
  teamSize: number;
  maxGens: number;
  popSize: number;
  numIslands: number;
  excludeHidden: boolean;
  excludeShadow: boolean;
  gaRunning: boolean;
  onFieldChange: (v: string) => void;
  onEvoStageChange: (v: string) => void;
  onTeamSizeChange: (v: number) => void;
  onMaxGensChange: (v: number) => void;
  onPopSizeChange: (v: number) => void;
  onNumIslandsChange: (v: number) => void;
  onExcludeHiddenChange: (v: boolean) => void;
  onExcludeShadowChange: (v: boolean) => void;
  onStart: () => void;
  onStop: () => void;
}

export function ConfigPanel(props: ConfigPanelProps) {
  return (
    <div class="panel">
      <div class="panel-title">Configuration</div>

      <div class="field-group">
        <label>Field / Biome</label>
        <select value={props.field} onChange={e => props.onFieldChange(e.currentTarget.value)}>
          <For each={FIELDS}>{f =>
            <option value={f.token}>{f.name} — [{f.baseTypes.join(', ')}]</option>
          }</For>
        </select>
      </div>

      <div class="field-group">
        <label>Evolution Stage Filter</label>
        <select value={props.evoStage} onChange={e => props.onEvoStageChange(e.currentTarget.value)}>
          <option value="">All stages</option>
          <option value="1">Stage 1 only</option>
          <option value="2">Stage 2 only</option>
          <option value="3">Stage 3 only</option>
        </select>
      </div>

      <div class="row2">
        <div class="field-group">
          <label>Team Size</label>
          <input type="number" value={props.teamSize} min="1" max="20"
            onInput={e => props.onTeamSizeChange(parseInt(e.currentTarget.value) || 8)} />
        </div>
        <div class="field-group">
          <label>Generations</label>
          <input type="number" value={props.maxGens} min="10" max="1000"
            onInput={e => props.onMaxGensChange(parseInt(e.currentTarget.value) || 150)} />
        </div>
      </div>

      <div class="row2">
        <div class="field-group">
          <label>Pop Size</label>
          <input type="number" value={props.popSize} min="10" max="300"
            onInput={e => props.onPopSizeChange(parseInt(e.currentTarget.value) || 60)} />
        </div>
        <div class="field-group">
          <label>Islands</label>
          <input type="number" value={props.numIslands} min="1" max="6"
            onInput={e => props.onNumIslandsChange(parseInt(e.currentTarget.value) || 3)} />
        </div>
      </div>

      <label class="checkbox-row">
        <input type="checkbox" checked={props.excludeHidden}
          onChange={e => props.onExcludeHiddenChange(e.currentTarget.checked)} />
        <span>Exclude hidden Pokémon</span>
      </label>

      <label class="checkbox-row">
        <input type="checkbox" checked={props.excludeShadow}
          onChange={e => props.onExcludeShadowChange(e.currentTarget.checked)} />
        <span>Exclude shadow / shining</span>
      </label>

      <button id="runBtn" onClick={props.onStart} disabled={props.gaRunning}>
        ▶ RUN SOLVER
      </button>
      <Show when={props.gaRunning}>
        <button id="stopBtn" onClick={props.onStop}>■ STOP</button>
      </Show>
    </div>
  );
}

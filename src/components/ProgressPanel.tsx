import { For } from 'solid-js';
import { Sparkline } from './Sparkline';
import { LogArea, type LogEntry } from './LogArea';

interface ProgressPanelProps {
  genNum: number;
  bestScore: number | null;
  poolSize: number | null;
  elapsed: string;
  seedsEval: number;
  cacheHit: string;
  prunedCnt: number;
  stagnantCnt: number;
  progress: number;
  scoreHistory: number[];
  logs: LogEntry[];
}

export function ProgressPanel(props: ProgressPanelProps) {
  return (
    <div class="panel">
      <div class="panel-title">Evolution Progress</div>
      <div class="stat-row">
        <div class="stat-box">
          <span class="val">{props.genNum}</span>
          <span class="lbl">Gen</span>
        </div>
        <div class="stat-box">
          <span class="val">{props.bestScore !== null ? props.bestScore.toFixed(2) : '—'}</span>
          <span class="lbl">Best</span>
        </div>
        <div class="stat-box">
          <span class="val">{props.poolSize ?? '—'}</span>
          <span class="lbl">Pool</span>
        </div>
        <div class="stat-box">
          <span class="val">{props.elapsed}</span>
          <span class="lbl">Time</span>
        </div>
      </div>
      <div class="stat-row">
        <div class="stat-box">
          <span class="val">{props.seedsEval}</span>
          <span class="lbl">Evaluated</span>
        </div>
        <div class="stat-box">
          <span class="val">{props.cacheHit}</span>
          <span class="lbl">Cache Hit</span>
        </div>
        <div class="stat-box">
          <span class="val">{props.prunedCnt}</span>
          <span class="lbl">Pruned</span>
        </div>
        <div class="stat-box">
          <span class="val">{props.stagnantCnt}</span>
          <span class="lbl">Stagnant</span>
        </div>
      </div>
      <div class="bar-track">
        <div id="bar" style={{ width: props.progress + '%' }}></div>
      </div>
      <Sparkline scoreHistory={props.scoreHistory} />
      <LogArea logs={props.logs} />
    </div>
  );
}

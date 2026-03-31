import { createSignal, onCleanup, For, Show } from 'solid-js';
import { DB, TOKEN_LIST } from './data/db';
import { FIELDS, FIELDS_INDEX } from './data/fields';
import { GA_CONFIG } from './solver/config';
import { FitnessEvaluator, fitnessScore, type FitnessBreakdown } from './solver/fitness';
import { GeneticAlgorithmEngine } from './solver/ga-engine';
import { HybridSearchPipeline } from './solver/pipeline';
import { SeedEvaluationCache } from './solver/seed-cache';
import { AppealEffectsCache } from './solver/appeal-cache';
import { AppealPruner } from './solver/appeal-pruner';
import { SymmetryCache } from './solver/symmetry';

// ── localStorage keys ──
const LS_SETTINGS = 'pokebox_settings';
const LS_RESULTS  = 'pokebox_results';

interface SavedSettings {
  field?: string;
  limit?: string;
  gens?: string;
  popsize?: string;
  islands?: string;
  excHidden?: boolean;
  excShadow?: boolean;
  evoStage?: string;
}

interface SavedResults {
  team: string[];
  score: number;
  targets: string[];
}

function loadSettings(): SavedSettings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (raw) return JSON.parse(raw) as SavedSettings;
  } catch (_) {}
  return {};
}

function loadResults(): SavedResults | null {
  try {
    const raw = localStorage.getItem(LS_RESULTS);
    if (raw) return JSON.parse(raw) as SavedResults;
  } catch (_) {}
  return null;
}

// ── Sprite URL ──
function spriteUrl(token: string): string | null {
  const p = DB[token]; if (!p) return null;
  const dex = p.d;
  if (!dex || typeof dex !== 'number' || dex > 1000) return null;
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${Math.floor(dex)}.png`;
}

// ── Appeal chart data ──
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

const TYPE_COLORS: Record<string, string> = {
  fire:'#b22222', water:'#1565c0', grass:'#2e7d32', electric:'#c6a800',
  ice:'#00838f', fighting:'#7b1c00', poison:'#6a1b9a', ground:'#8d6e36',
  flying:'#1976d2', psychic:'#ad1457', bug:'#558b2f', rock:'#6d4c41',
  ghost:'#4527a0', dragon:'#283593', dark:'#212121', steel:'#455a64',
  fairy:'#c2185b', normal:'#546e7a',
};

interface LogEntry {
  text: string;
  kind: 'info' | 'good' | 'warn' | 'bad';
}

interface ResultsState {
  team: string[];
  score: number;
  targets: string[];
  breakdown: FitnessBreakdown;
}

export function App() {
  const saved = loadSettings();

  // ── Form signals ──
  const [field, setField] = createSignal(saved.field || FIELDS[0].token);
  const [evoStage, setEvoStage] = createSignal(saved.evoStage || '');
  const [teamSize, setTeamSize] = createSignal(parseInt(saved.limit || '8'));
  const [maxGens, setMaxGens] = createSignal(parseInt(saved.gens || '150'));
  const [popSize, setPopSize] = createSignal(parseInt(saved.popsize || '60'));
  const [numIslands, setNumIslands] = createSignal(parseInt(saved.islands || '3'));
  const [excludeHidden, setExcludeHidden] = createSignal(saved.excHidden !== undefined ? saved.excHidden : true);
  const [excludeShadow, setExcludeShadow] = createSignal(saved.excShadow !== undefined ? saved.excShadow : false);

  // ── Progress signals ──
  const [gaRunning, setGaRunning] = createSignal(false);
  const [showProgress, setShowProgress] = createSignal(false);
  const [genNum, setGenNum] = createSignal(0);
  const [bestScore, setBestScore] = createSignal<number | null>(null);
  const [poolSizeVal, setPoolSizeVal] = createSignal<number | null>(null);
  const [elapsed, setElapsed] = createSignal('0s');
  const [seedsEval, setSeedsEval] = createSignal(0);
  const [cacheHit, setCacheHit] = createSignal('0%');
  const [prunedCnt, setPrunedCnt] = createSignal(0);
  const [stagnantCnt, setStagnantCnt] = createSignal(0);
  const [progress, setProgress] = createSignal(0);
  const [scoreHistory, setScoreHistory] = createSignal<number[]>([]);
  const [logs, setLogs] = createSignal<LogEntry[]>([]);

  // ── Results signal ──
  const [results, setResults] = createSignal<ResultsState | null>(null);

  // ── Mutable solver state (not reactive) ──
  let gaWorkerTimer: ReturnType<typeof setTimeout> | null = null;
  let timerID: ReturnType<typeof setInterval> | null = null;
  let startTime = 0;
  let gaGen = 0;
  let gaStopped = false;
  let gaState: {
    islands: string[][][];
    bestTeam: string[] | null;
    bestScore: number;
    prevBestScore: number;
    maxGens: number;
    pool: string[];
    targets: string[];
    teamSize: number;
    popSize: number;
    numIslands: number;
  } | null = null;
  let _seedCache: SeedEvaluationCache | null = null;
  let _appealCache: AppealEffectsCache | null = null;
  let _pruner: AppealPruner | null = null;
  let _symCache: SymmetryCache | null = null;
  let _gaEngine: GeneticAlgorithmEngine | null = null;
  let _pipeline: HybridSearchPipeline | null = null;

  onCleanup(() => {
    if (timerID) clearInterval(timerID);
    if (gaWorkerTimer) clearTimeout(gaWorkerTimer);
  });

  function addLog(text: string, kind: LogEntry['kind'] = 'info') {
    setLogs(prev => [...prev, { text, kind }]);
  }

  function buildPool(): string[] {
    const excH = excludeHidden();
    const excS = excludeShadow();
    const evo = evoStage();
    return TOKEN_LIST.filter(token => {
      const p = DB[token]; if (!p) return false;
      if (excH && p.h) return false;
      if (excS && p.t && (p.t.includes('shadow') || p.t.includes('shining'))) return false;
      if (evo && String(p.e) !== evo) return false;
      return true;
    });
  }

  function saveSettings() {
    try {
      localStorage.setItem(LS_SETTINGS, JSON.stringify({
        field: field(), limit: String(teamSize()), gens: String(maxGens()),
        popsize: String(popSize()), islands: String(numIslands()),
        excHidden: excludeHidden(), excShadow: excludeShadow(), evoStage: evoStage(),
      }));
    } catch (_) {}
  }

  function renderResultsState(team: string[], score: number, targets: string[]) {
    const breakdown = new FitnessEvaluator(targets).breakdown(team);
    setResults({ team, score, targets, breakdown });
    try {
      localStorage.setItem(LS_RESULTS, JSON.stringify({ team, score, targets }));
    } catch (_) {}
  }

  function finishSolve(team: string[] | null, score: number | null, targets: string[] | null) {
    if (timerID) { clearInterval(timerID); timerID = null; }
    setGaRunning(false);
    setProgress(100);
    if (team && score !== null && targets) {
      renderResultsState(team, score, targets);
    }
  }

  function runGAChunk() {
    if (gaStopped || !gaState || !_gaEngine || !_pipeline) return;
    const { islands, pool, targets, maxGens } = gaState;
    const chunkEnd = Math.min(gaGen + GA_CONFIG.CHUNK_SIZE, maxGens);

    for (; gaGen < chunkEnd; gaGen++) {
      const gen = gaGen + 1;
      const mutRate = _gaEngine.adaptiveMutRate(gen, maxGens);

      for (let idx = 0; idx < gaState.numIslands; idx++) {
        const pop    = islands[idx];
        const scores = pop.map(t => _pipeline!.evaluateSeed(t));
        let bestIdx = 0;
        for (let i = 1; i < scores.length; i++) {
          if (scores[i] > scores[bestIdx]) bestIdx = i;
        }
        if (scores[bestIdx] > gaState!.bestScore) {
          gaState!.bestScore = scores[bestIdx];
          gaState!.bestTeam  = [...pop[bestIdx]];
        }
        islands[idx] = _gaEngine.evolveIsland(pop, scores, pool, mutRate);
      }

      if (gen % GA_CONFIG.MIGRATION_FREQ === 0) {
        const migrants = islands.map(isl => isl[Math.floor(Math.random() * isl.length)]);
        for (let i = 0; i < gaState.numIslands; i++) {
          const dest = (i + 1) % gaState.numIslands;
          const replaceIdx = Math.floor(Math.random() * islands[dest].length);
          islands[dest][replaceIdx] = migrants[i];
        }
      }
    }

    // MCTS refinement
    if (gaState.bestTeam) {
      const improved  = _pipeline.runMCTS(gaState.bestTeam, GA_CONFIG.MCTS_ITERATIONS);
      const mctsScore = _pipeline.evaluateSeed(improved);
      if (Number.isFinite(mctsScore) && mctsScore > gaState.bestScore) {
        gaState.bestScore = mctsScore;
        gaState.bestTeam  = improved;
      }
    }

    // Stagnation
    if (gaState.bestScore > gaState.prevBestScore) {
      _pipeline.metrics.stagnantGens = 0;
      gaState.prevBestScore = gaState.bestScore;
    } else {
      _pipeline.metrics.stagnantGens++;
    }
    const earlyStop = _pipeline.metrics.stagnantGens >= GA_CONFIG.STAGNATION_LIMIT;

    // Update UI signals
    const pct = Math.round((gaGen / maxGens) * 100);
    setProgress(pct);
    setGenNum(gaGen);
    setBestScore(gaState.bestScore);
    setScoreHistory(prev => [...prev, gaState!.bestScore]);
    setSeedsEval(_pipeline.metrics.seedsEvaluated);
    const totalQ = _symCache ? _symCache.total : 0;
    const totalH = _symCache ? _symCache.hits  : 0;
    setCacheHit(totalQ > 0 ? Math.round((totalH / totalQ) * 100) + '%' : '0%');
    setPrunedCnt(_pipeline.metrics.pruned);
    setStagnantCnt(_pipeline.metrics.stagnantGens);

    if (earlyStop) {
      addLog(`⚡ Early stop at gen ${gaGen}: no improvement for ${GA_CONFIG.STAGNATION_LIMIT} generations.`, 'warn');
      addLog(`✓ Complete! Best fitness: ${gaState.bestScore.toFixed(2)}`, 'good');
      finishSolve(gaState.bestTeam, gaState.bestScore, gaState.targets);
    } else if (gaGen < maxGens) {
      gaWorkerTimer = setTimeout(runGAChunk, 0);
    } else {
      addLog(`✓ Complete! Best fitness: ${gaState.bestScore.toFixed(2)}`, 'good');
      finishSolve(gaState.bestTeam, gaState.bestScore, gaState.targets);
    }
  }

  function startSolve() {
    if (gaRunning()) return;

    const ts   = Math.max(1, teamSize());
    const mg   = Math.max(1, maxGens());
    const ps   = Math.max(2, popSize());
    const ni   = Math.max(1, numIslands());

    saveSettings();

    if (timerID) clearInterval(timerID);
    if (gaWorkerTimer) clearTimeout(gaWorkerTimer);

    gaStopped = false;
    setGaRunning(true);
    setShowProgress(true);
    setLogs([]);
    setScoreHistory([]);
    setGenNum(0);
    setBestScore(null);
    setProgress(0);
    setSeedsEval(0);
    setCacheHit('0%');
    setPrunedCnt(0);
    setStagnantCnt(0);

    _seedCache   = new SeedEvaluationCache();
    _appealCache = new AppealEffectsCache();
    _pruner      = new AppealPruner();
    _symCache    = new SymmetryCache();

    const fieldObj  = FIELDS_INDEX[field()];
    const targets   = fieldObj.baseTypes;
    const pool      = buildPool();

    setPoolSizeVal(pool.length);
    addLog(`Field: ${fieldObj.name} [${targets.join(', ')}]`, 'info');
    addLog(`Pool: ${pool.length} Pokémon | Team size: ${ts}`, 'info');
    addLog(`Islands: ${ni} | Pop: ${ps} | Gens: ${mg}`, 'info');

    if (pool.length < ts) {
      addLog(`Pool too small (${pool.length} < ${ts}). Relax filters.`, 'warn');
      finishSolve(null, null, targets);
      return;
    }

    _gaEngine = new GeneticAlgorithmEngine();
    _pipeline = new HybridSearchPipeline(targets, pool, _gaEngine, {
      symCache: _symCache,
      pruner: _pruner,
      seedCache: _seedCache,
    });

    gaGen = 0;
    const islands = _gaEngine.initIslands(pool, ps, ts, ni);
    gaState = {
      islands, bestTeam: null, bestScore: -Infinity, prevBestScore: -Infinity,
      maxGens: mg, pool, targets, teamSize: ts, popSize: ps, numIslands: ni,
    };

    startTime = Date.now();
    timerID = setInterval(() => {
      setElapsed(((Date.now() - startTime) / 1000).toFixed(1) + 's');
    }, 200);

    runGAChunk();
  }

  function stopSolve() {
    if (!gaRunning()) return;
    gaStopped = true;
    if (gaWorkerTimer) clearTimeout(gaWorkerTimer);
    addLog('Stopped by user.', 'warn');
    if (gaState && gaState.bestTeam) {
      addLog(`Best result so far: fitness ${gaState.bestScore.toFixed(2)}`, 'info');
      finishSolve(gaState.bestTeam, gaState.bestScore, gaState.targets);
    } else {
      finishSolve(null, null, null);
    }
  }

  // Restore previous results on mount
  const savedResults = loadResults();
  if (savedResults) {
    const breakdown = new FitnessEvaluator(savedResults.targets).breakdown(savedResults.team);
    setResults({ ...savedResults, breakdown });
  }

  // ── Sparkline computation ──
  function sparklinePoints(): { line: string; area: string } {
    const h = scoreHistory();
    if (h.length < 2) return { line: '', area: '' };
    const W = 300, H = 50, pad = 3;
    let minV = h[0], maxV = h[0];
    for (const v of h) { if (v < minV) minV = v; if (v > maxV) maxV = v; }
    const range = maxV - minV || 1;
    const pts = h.map((v, i) => {
      const x = (i / (h.length - 1)) * W;
      const y = H - pad - ((v - minV) / range) * (H - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const lineStr = pts.join(' ');
    const areaStr = `0,${H} ` + lineStr + ` ${W},${H}`;
    return { line: lineStr, area: areaStr };
  }

  return (
    <div class="app">
      <header>
        <h1>POKÉBOX<span class="blink">_</span></h1>
        <span class="sub">TEAM SOLVER // ISLAND GA ENGINE</span>
      </header>

      <div class="layout">
        {/* ── Left: Controls ── */}
        <div class="panel">
          <div class="panel-title">Configuration</div>

          <div class="field-group">
            <label>Field / Biome</label>
            <select value={field()} onChange={e => setField(e.currentTarget.value)}>
              <For each={FIELDS}>{f =>
                <option value={f.token}>{f.name} — [{f.baseTypes.join(', ')}]</option>
              }</For>
            </select>
          </div>

          <div class="field-group">
            <label>Evolution Stage Filter</label>
            <select value={evoStage()} onChange={e => setEvoStage(e.currentTarget.value)}>
              <option value="">All stages</option>
              <option value="1">Stage 1 only</option>
              <option value="2">Stage 2 only</option>
              <option value="3">Stage 3 only</option>
            </select>
          </div>

          <div class="row2">
            <div class="field-group">
              <label>Team Size</label>
              <input type="number" value={teamSize()} min="1" max="20"
                onInput={e => setTeamSize(parseInt(e.currentTarget.value) || 8)} />
            </div>
            <div class="field-group">
              <label>Generations</label>
              <input type="number" value={maxGens()} min="10" max="1000"
                onInput={e => setMaxGens(parseInt(e.currentTarget.value) || 150)} />
            </div>
          </div>

          <div class="row2">
            <div class="field-group">
              <label>Pop Size</label>
              <input type="number" value={popSize()} min="10" max="300"
                onInput={e => setPopSize(parseInt(e.currentTarget.value) || 60)} />
            </div>
            <div class="field-group">
              <label>Islands</label>
              <input type="number" value={numIslands()} min="1" max="6"
                onInput={e => setNumIslands(parseInt(e.currentTarget.value) || 3)} />
            </div>
          </div>

          <label class="checkbox-row">
            <input type="checkbox" checked={excludeHidden()}
              onChange={e => setExcludeHidden(e.currentTarget.checked)} />
            <span>Exclude hidden Pokémon</span>
          </label>

          <label class="checkbox-row">
            <input type="checkbox" checked={excludeShadow()}
              onChange={e => setExcludeShadow(e.currentTarget.checked)} />
            <span>Exclude shadow / shining</span>
          </label>

          <button id="runBtn" onClick={startSolve} disabled={gaRunning()}>
            ▶ RUN SOLVER
          </button>
          <Show when={gaRunning()}>
            <button id="stopBtn" onClick={stopSolve}>■ STOP</button>
          </Show>
        </div>

        {/* ── Right: Output ── */}
        <div class="right-col">
          {/* Progress */}
          <Show when={showProgress()}>
            <div class="panel">
              <div class="panel-title">Evolution Progress</div>
              <div class="stat-row">
                <div class="stat-box">
                  <span class="val">{genNum()}</span>
                  <span class="lbl">Gen</span>
                </div>
                <div class="stat-box">
                  <span class="val">{bestScore() !== null ? bestScore()!.toFixed(2) : '—'}</span>
                  <span class="lbl">Best</span>
                </div>
                <div class="stat-box">
                  <span class="val">{poolSizeVal() ?? '—'}</span>
                  <span class="lbl">Pool</span>
                </div>
                <div class="stat-box">
                  <span class="val">{elapsed()}</span>
                  <span class="lbl">Time</span>
                </div>
              </div>
              <div class="stat-row">
                <div class="stat-box">
                  <span class="val">{seedsEval()}</span>
                  <span class="lbl">Evaluated</span>
                </div>
                <div class="stat-box">
                  <span class="val">{cacheHit()}</span>
                  <span class="lbl">Cache Hit</span>
                </div>
                <div class="stat-box">
                  <span class="val">{prunedCnt()}</span>
                  <span class="lbl">Pruned</span>
                </div>
                <div class="stat-box">
                  <span class="val">{stagnantCnt()}</span>
                  <span class="lbl">Stagnant</span>
                </div>
              </div>
              <div class="bar-track">
                <div id="bar" style={{ width: progress() + '%' }}></div>
              </div>
              <div class="sparkline-wrap">
                <svg id="sparkline" viewBox="0 0 300 50" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#c8ff00"/>
                      <stop offset="100%" stop-color="#c8ff00" stop-opacity="0"/>
                    </linearGradient>
                  </defs>
                  <polygon id="sparkline-area" points={sparklinePoints().area}/>
                  <polyline id="sparkline-line" points={sparklinePoints().line}/>
                </svg>
              </div>
              <div id="log">
                <For each={logs()}>{entry =>
                  <div class={`log-${entry.kind}`}>› {entry.text}</div>
                }</For>
              </div>
            </div>
          </Show>

          {/* Results */}
          <Show when={results()}>
            {r => {
              const res = r();
              const { team, score, targets, breakdown } = res;
              const chartData = appealChartData(team, targets);
              const maxVal = chartData.values.reduce((a, b) => Math.max(a, b), 1);
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
                    <For each={team}>{token => {
                      const p = DB[token] || { n: token, t: [], e: 0, g: '', c: null, d: 0, h: false, se: null, lp: null, r: '' };
                      const types = p.t || [];
                      const spr = spriteUrl(token);
                      const meta = [
                        p.e ? `S${p.e}` : null,
                        p.g ? `G${p.g}` : null,
                        p.r ? p.r : null,
                      ].filter(Boolean).join(' · ');
                      const cls = p.c || '';
                      const ip = fitnessScore([token], targets);
                      const bd = new FitnessEvaluator(targets).breakdown([token]);
                      return (
                        <div class="poke-card">
                          <Show when={spr} fallback={<span class="poke-no-sprite">◈</span>}>
                            {url => (
                              <>
                                <img class="poke-sprite" src={url()} alt={p.n || token}
                                  onError={e => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                    const next = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
                                    if (next) next.style.display = 'flex';
                                  }} />
                                <span class="poke-no-sprite" style="display:none">?</span>
                              </>
                            )}
                          </Show>
                          <div class="poke-name">{p.n || token}</div>
                          <div class="poke-meta">{meta}</div>
                          <Show when={cls}>
                            <div><span class={`poke-class-badge cls-${cls}`}>{cls.replace(/-/g,' ')}</span></div>
                          </Show>
                          <div class="poke-types">
                            <For each={types}>{t =>
                              <span class={`type-badge tb-${t}`}>{t}</span>
                            }</For>
                          </div>
                          <Show when={ip > 0} fallback={<div class="poke-score muted">—</div>}>
                            <div class="poke-score">
                              ↑ {ip.toFixed(1)}
                              <Show when={bd.rarity > 0}>
                                {' '}<span class="muted">+{bd.rarity.toFixed(1)}★</span>
                              </Show>
                            </div>
                          </Show>
                        </div>
                      );
                    }}</For>
                  </div>
                  <Show when={chartData.labels.length > 0}>
                    <div id="chart-wrap">
                      <h3>TYPE APPEAL BREAKDOWN</h3>
                      <div class="bar-chart">
                        <For each={chartData.labels}>{(lbl, i) => {
                          const pct = Math.round((chartData.values[i()] / maxVal) * 100);
                          const color = TYPE_COLORS[lbl] || '#555';
                          return (
                            <div class="bar-row">
                              <span class="bar-label">{lbl}</span>
                              <div class="bar-fill-wrap">
                                <div class="bar-fill" style={{ width: pct + '%', background: color }}></div>
                              </div>
                              <span class="bar-val">{chartData.values[i()]}</span>
                            </div>
                          );
                        }}</For>
                      </div>
                    </div>
                  </Show>
                </div>
              );
            }}
          </Show>

          {/* Idle hint */}
          <Show when={!showProgress() && !results()}>
            <div class="idle-hint">
              <span class="big">◈</span>
              Select a field and hit RUN SOLVER to evolve your team
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}

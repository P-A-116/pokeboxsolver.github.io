import { createSignal, onCleanup, Show } from 'solid-js';
import { DB, TOKEN_LIST } from './data/db';
import { FIELDS_INDEX } from './data/fields';
import { GA_CONFIG } from './solver/config';
import { FitnessEvaluator, type FitnessBreakdown } from './solver/fitness';
import { GeneticAlgorithmEngine } from './solver/ga-engine';
import { HybridSearchPipeline } from './solver/pipeline';
import { SeedEvaluationCache } from './solver/seed-cache';
import { AppealEffectsCache } from './solver/appeal-cache';
import { AppealPruner } from './solver/appeal-pruner';
import { SymmetryCache } from './solver/symmetry';
import { Header } from './components/Header';
import { ConfigPanel } from './components/ConfigPanel';
import { ProgressPanel } from './components/ProgressPanel';
import { ResultsPanel } from './components/ResultsPanel';
import type { LogEntry } from './components/LogArea';

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

interface ResultsState {
  team: string[];
  score: number;
  targets: string[];
  breakdown: FitnessBreakdown;
}

export function App() {
  const saved = loadSettings();

  // ── Form signals ──
  const [field, setField] = createSignal(saved.field || FIELDS_INDEX['forest'].token);
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

    // Stagnation detection
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

    const ts = Math.max(1, teamSize());
    const mg = Math.max(1, maxGens());
    const ps = Math.max(2, popSize());
    const ni = Math.max(1, numIslands());

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

    const fieldObj = FIELDS_INDEX[field()];
    const targets  = fieldObj.baseTypes;
    const pool     = buildPool();

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
      appealCache: _appealCache,
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

  return (
    <div class="app">
      <Header />

      <div class="layout">
        {/* ── Left: Controls ── */}
        <ConfigPanel
          field={field()}
          evoStage={evoStage()}
          teamSize={teamSize()}
          maxGens={maxGens()}
          popSize={popSize()}
          numIslands={numIslands()}
          excludeHidden={excludeHidden()}
          excludeShadow={excludeShadow()}
          gaRunning={gaRunning()}
          onFieldChange={setField}
          onEvoStageChange={setEvoStage}
          onTeamSizeChange={setTeamSize}
          onMaxGensChange={setMaxGens}
          onPopSizeChange={setPopSize}
          onNumIslandsChange={setNumIslands}
          onExcludeHiddenChange={setExcludeHidden}
          onExcludeShadowChange={setExcludeShadow}
          onStart={startSolve}
          onStop={stopSolve}
        />

        {/* ── Right: Output ── */}
        <div class="right-col">
          <Show when={showProgress()}>
            <ProgressPanel
              genNum={genNum()}
              bestScore={bestScore()}
              poolSize={poolSizeVal()}
              elapsed={elapsed()}
              seedsEval={seedsEval()}
              cacheHit={cacheHit()}
              prunedCnt={prunedCnt()}
              stagnantCnt={stagnantCnt()}
              progress={progress()}
              scoreHistory={scoreHistory()}
              logs={logs()}
            />
          </Show>

          <ResultsPanel results={results()} />

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

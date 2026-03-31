import { Show, For } from 'solid-js';
import { DB } from '../data/db';
import { FitnessEvaluator, fitnessScore } from '../solver/fitness';

interface PokeCardProps {
  token: string;
  targets: string[];
}

const MAX_SUPPORTED_DEX_NUMBER = 1000;

function spriteUrl(token: string): string | null {
  const p = DB[token]; if (!p) return null;
  const dex = p.d;
  if (!dex || typeof dex !== 'number' || dex > MAX_SUPPORTED_DEX_NUMBER) return null;
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${Math.floor(dex)}.png`;
}

export function PokeCard(props: PokeCardProps) {
  const p = () => DB[props.token] || { n: props.token, t: [], e: 0, g: '', c: null, d: 0, h: false, se: null, lp: null, r: '' };
  const types = () => p().t || [];
  const spr = () => spriteUrl(props.token);
  const meta = () => [
    p().e ? `S${p().e}` : null,
    p().g ? `G${p().g}` : null,
    p().r ? p().r : null,
  ].filter(Boolean).join(' · ');
  const cls = () => p().c || '';
  const ip = () => fitnessScore([props.token], props.targets);
  const bd = () => new FitnessEvaluator(props.targets).breakdown([props.token]);

  return (
    <div class="poke-card">
      <Show when={spr()} fallback={<span class="poke-no-sprite">◈</span>}>
        {url => (
          <>
            <img class="poke-sprite" src={url()} alt={p().n || props.token}
              onError={e => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
                const next = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
                if (next) next.style.display = 'flex';
              }} />
            <span class="poke-no-sprite" style="display:none">?</span>
          </>
        )}
      </Show>
      <div class="poke-name">{p().n || props.token}</div>
      <div class="poke-meta">{meta()}</div>
      <Show when={cls()}>
        <div><span class={`poke-class-badge cls-${cls()}`}>{cls().replace(/-/g,' ')}</span></div>
      </Show>
      <div class="poke-types">
        <For each={types()}>{t =>
          <span class={`type-badge tb-${t}`}>{t}</span>
        }</For>
      </div>
      <Show when={ip() > 0} fallback={<div class="poke-score muted">—</div>}>
        <div class="poke-score">
          ↑ {ip().toFixed(1)}
          <Show when={bd().rarity > 0}>
            {' '}<span class="muted">+{bd().rarity.toFixed(1)}★</span>
          </Show>
        </div>
      </Show>
    </div>
  );
}

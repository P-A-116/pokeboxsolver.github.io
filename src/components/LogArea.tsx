import { For } from 'solid-js';

export interface LogEntry {
  text: string;
  kind: 'info' | 'good' | 'warn' | 'bad';
}

interface LogAreaProps {
  logs: LogEntry[];
}

export function LogArea(props: LogAreaProps) {
  return (
    <div id="log">
      <For each={props.logs}>{entry =>
        <div class={`log-${entry.kind}`}>› {entry.text}</div>
      }</For>
    </div>
  );
}

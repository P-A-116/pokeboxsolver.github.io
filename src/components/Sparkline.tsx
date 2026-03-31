interface SparklineProps {
  scoreHistory: number[];
}

export function Sparkline(props: SparklineProps) {
  const points = () => {
    const h = props.scoreHistory;
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
  };

  return (
    <div class="sparkline-wrap">
      <svg id="sparkline" viewBox="0 0 300 50" preserveAspectRatio="none">
        <defs>
          <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#c8ff00"/>
            <stop offset="100%" stop-color="#c8ff00" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <polygon id="sparkline-area" points={points().area}/>
        <polyline id="sparkline-line" points={points().line}/>
      </svg>
    </div>
  );
}

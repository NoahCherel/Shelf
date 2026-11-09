import { useId } from "react";
import "./parts.css";

// The line stays in the upper part of the box, with the area filling below it.
const TOP = 10;
const SPAN = 50;

function points(values: number[]): [number, number][] {
  const series = values.length === 1 ? [values[0], values[0]] : values;
  const low = Math.min(...series);
  const range = Math.max(...series) - low;
  const step = 100 / (series.length - 1);
  return series.map((v, i) => [i * step, TOP + (range === 0 ? 0.5 : 1 - (v - low) / range) * SPAN]);
}

export function endY(values: number[]): number {
  const all = points(values);
  return +all[all.length - 1][1].toFixed(2);
}

/** The same line, rounded with Catmull-Rom curves. */
export function smoothPath(values: number[]): string {
  if (values.length === 0) return "";
  const p = points(values);
  const n = (x: number) => +x.toFixed(2);
  let d = `M${n(p[0][0])} ${n(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const [a, b, c, e] = [p[i - 1] ?? p[i], p[i], p[i + 1], p[i + 2] ?? p[i + 1]];
    const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const c2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    d += `C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(c[0])} ${n(c[1])}`;
  }
  return d;
}

export interface SparklineProps {
  values: number[];
  color: string;
  fill?: boolean;
}

export function Sparkline({ values, color, fill = false }: SparklineProps) {
  const id = useId();
  const path = smoothPath(values);
  return (
    <div className="spark">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {path && fill && (
          <>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity="0.32" />
                <stop offset="1" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${path}L100 100L0 100Z`} fill={`url(#${id})`} />
          </>
        )}
        {path && (
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {path && fill && <span className="spark__dot" style={{ top: `${endY(values)}%`, background: color }} />}
    </div>
  );
}

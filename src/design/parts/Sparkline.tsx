import { useId } from "react";
import "./parts.css";

/** A line through the values in a 100 × 100 box; flat at mid-height when they don't vary. */
export function sparkPath(values: number[]): string {
  if (values.length === 0) return "";
  const series = values.length === 1 ? [values[0], values[0]] : values;
  const low = Math.min(...series);
  const range = Math.max(...series) - low;
  const step = 100 / (series.length - 1);
  return series
    .map((v, i) => {
      const y = range === 0 ? 50 : 100 - ((v - low) / range) * 100;
      return `${i === 0 ? "M" : "L"}${+(i * step).toFixed(2)} ${+y.toFixed(2)}`;
    })
    .join("");
}

export interface SparklineProps {
  values: number[];
  color: string;
  fill?: boolean;
}

export function Sparkline({ values, color, fill = false }: SparklineProps) {
  const id = useId();
  const path = sparkPath(values);
  return (
    <svg className="spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
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
  );
}

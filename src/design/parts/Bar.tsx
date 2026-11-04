import type { CSSProperties } from "react";
import "./parts.css";

export type Level = "good" | "warn" | "full";

export function levelFor(percent: number): Level {
  if (percent >= 90) return "full";
  if (percent >= 70) return "warn";
  return "good";
}

export interface BarProps {
  percent: number;
  level?: Level;
  /** Height as any CSS length; defaults to a share of T. */
  thickness?: string;
}

export function Bar({ percent, level, thickness }: BarProps) {
  const value = Math.min(100, Math.max(0, percent));
  const style = thickness ? ({ "--thickness": thickness } as CSSProperties) : undefined;
  return (
    <div className="bar" style={style}>
      <div data-level={level ?? levelFor(value)} style={{ width: `${value}%` }} />
    </div>
  );
}

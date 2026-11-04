import type { CSSProperties, ReactNode } from "react";
import "./parts.css";

export interface TileProps {
  /** In tile heights; a square tile is 1. */
  width: number;
  tone?: "glass" | "solid";
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function Tile({ width, tone = "glass", onClick, className = "", style, children }: TileProps) {
  const cls = `tile tile--${tone} ${className}`.trim();
  const merged = { width: `calc(var(--T) * ${width})`, ...style };
  if (onClick) {
    return (
      <button type="button" className={cls} style={merged} onClick={onClick}>
        {children}
      </button>
    );
  }
  return (
    <div className={cls} style={merged}>
      {children}
    </div>
  );
}

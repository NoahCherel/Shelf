import type { CSSProperties, ReactNode } from "react";
import "./parts.css";

export interface RingProps {
  percent: number;
  color?: string;
  /** In tile heights. */
  size: number;
  children?: ReactNode;
}

export function Ring({ percent, color = "var(--accent)", size, children }: RingProps) {
  const value = Math.min(100, Math.max(0, percent));
  return (
    <div className="ring" style={{ "--size": size } as CSSProperties}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="ring__track" cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" />
        {value > 0 && (
          <circle
            data-role="value"
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${value} 100`}
          />
        )}
      </svg>
      {children}
    </div>
  );
}

import type { CSSProperties, ReactNode } from "react";
import "./parts.css";

export interface RoundButtonProps {
  icon: ReactNode;
  label: string;
  color?: string;
  onClick: () => void;
}

export function RoundButton({ icon, label, color, onClick }: RoundButtonProps) {
  const style = color ? ({ "--color": color } as CSSProperties) : undefined;
  return (
    <button type="button" className="round" aria-label={label} title={label} style={style} onClick={onClick}>
      {icon}
    </button>
  );
}

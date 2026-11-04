import type { ReactNode } from "react";
import "./parts.css";

export interface RowProps {
  label: ReactNode;
  detail?: ReactNode;
  value?: ReactNode;
}

export function Row({ label, detail, value }: RowProps) {
  return (
    <div className="row">
      <span className="row__label">{label}</span>
      <span className="row__detail">{detail}</span>
      <span className="row__value">{value}</span>
    </div>
  );
}

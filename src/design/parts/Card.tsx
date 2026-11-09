import type { ReactNode } from "react";
import { invoke } from "../../core/tauri";
import "./card.css";

interface CardAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export interface CardProps {
  logo?: ReactNode;
  title: ReactNode;
  pill?: ReactNode;
  footer?: ReactNode;
  action?: CardAction;
  children?: ReactNode;
}

export function Card({ logo, title, pill, footer, action, children }: CardProps) {
  return (
    <section className="card">
      <header className="card__head">
        {logo && <div className="card__logo">{logo}</div>}
        <h1 className="card__title">{title}</h1>
        {pill && <span className="card__pill">{pill}</span>}
        <button type="button" className="card__close" aria-label="Close" onClick={() => invoke("close_card").catch(() => {})}>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 2.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="card__body">{children}</div>
      {(footer || action) && (
        <footer className="card__foot">
          <p className="card__note">{footer}</p>
          {action && (
            <button
              type="button"
              className={action.danger ? "card__action card__action--danger" : "card__action"}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
        </footer>
      )}
    </section>
  );
}

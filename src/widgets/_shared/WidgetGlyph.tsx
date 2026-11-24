import { useId } from "react";
import { CATEGORIES } from "../../core/categories";
import type { WidgetDef } from "../../core/widget";
import { ClaudeLogo } from "./ClaudeLogo";
import { OpenCodeLogo } from "./OpenCodeLogo";
import { StripeLogo } from "./StripeCard";
import "./ai-usage.css";
import "./claude.css";
import "./stripe.css";

function GeminiGlyph() {
  const gradId = useId();
  return (
    <span className="ai-logo--white" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4285f4" />
            <stop offset="55%" stopColor="#6c63ff" />
            <stop offset="100%" stopColor="#9b72cb" />
          </linearGradient>
        </defs>
        <path
          d="M12 2.2c.6 4.7 4.1 8.2 8.8 8.8-4.7.6-8.2 4.1-8.8 8.8-.6-4.7-4.1-8.2-8.8-8.8 4.7-.6 8.2-4.1 8.8-8.8Z"
          fill={`url(#${gradId})`}
        />
      </svg>
    </span>
  );
}

/** Crisp brand/widget icon used inside a dock folder's 2x2 mini-grid. */
export function WidgetGlyph({ def }: { def: WidgetDef | undefined }) {
  const id = def?.id ?? "";

  if (id === "claude-usage" || id === "claude-plan-usage") return <ClaudeLogo />;
  if (id === "opencode-usage" || id === "opencode-plan-usage") return <OpenCodeLogo />;
  if (id === "stripe" || id === "stripe-chart") return <StripeLogo />;
  if (id === "gemini-usage") return <GeminiGlyph />;

  if (id === "chatgpt-usage") {
    return (
      <span className="ai-logo--white" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3.2a4.3 4.3 0 0 1 4.1 3A4.3 4.3 0 0 1 19 12a4.3 4.3 0 0 1-2.9 5.8A4.3 4.3 0 0 1 12 20.8a4.3 4.3 0 0 1-4.1-3A4.3 4.3 0 0 1 5 12a4.3 4.3 0 0 1 2.9-5.8A4.3 4.3 0 0 1 12 3.2Z" />
          <polygon points="12,8.4 15.1,10.2 15.1,13.8 12,15.6 8.9,13.8 8.9,10.2" />
        </svg>
      </span>
    );
  }

  if (id === "grok-usage") {
    return (
      <span className="ai-logo--dark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="7.2" stroke="#f5f5f7" strokeWidth="2.3" />
          <path d="M8.2 15.8 17.5 6.5" stroke="#f5f5f7" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  if (id === "deepseek-balance") {
    return (
      <span className="ai-logo--blue" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M4.5 14.5c1.2 2.8 4.4 4.5 8 4.5 4.2 0 7-2.6 7-5.9 0-2.5-1.6-4.5-4.3-4.9-.8-2.2-2.7-3.4-5.2-3.4-1.5 0-2.8.5-3.8 1.4 1.3.2 2.2 1 2.4 2.1-2.5.9-4.1 3.3-4.1 6.2Z"
            fill="#ffffff"
          />
          <circle cx="14.6" cy="11.8" r="1.2" fill="#4d6bfe" />
        </svg>
      </span>
    );
  }

  if (id === "glm-usage") {
    return (
      <span className="ai-logo--teal" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M5.5 6.5h13L6.2 17.5h12.3" stroke="#6ee7b7" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  if (id === "cursor-usage") {
    return (
      <span className="ai-logo--dark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 3.2 19.6 7.6v8.8L12 20.8 4.4 16.4V7.6L12 3.2Z" stroke="#f5f5f7" strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 3.2v17.6M19.6 7.6 12 12 4.4 7.6" stroke="#f5f5f7" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  if (id === "github-activity") {
    return (
      <span className="wglyph" style={{ background: "#24292f" }} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="#ffffff">
          <path d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.5.1.7-.2.7-.5v-1.7c-2.7.6-3.3-1.2-3.3-1.2-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.5-1.1-4.5-4.9 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.6 1 2.7 0 3.8-2.3 4.6-4.5 4.9.4.3.7.9.7 1.9v2.7c0 .3.2.6.7.5A9.5 9.5 0 0 0 12 2.5Z" />
        </svg>
      </span>
    );
  }

  if (id === "clock") {
    return (
      <span className="wglyph" style={{ background: "#1c1c1e" }} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="12" r="8.2" />
          <path d="M12 7.5V12l3.2 2" />
        </svg>
      </span>
    );
  }

  if (id === "today") {
    return (
      <span className="wglyph" style={{ background: "#ff453a" }} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="5.5" width="16" height="14.5" rx="3" />
          <path d="M4 10h16M8.5 3.5v3M15.5 3.5v3" />
        </svg>
      </span>
    );
  }

  if (id === "clock-and-weather") {
    return (
      <span className="wglyph" style={{ background: "#0a84ff" }} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="15" cy="9" r="3.6" fill="#ffd60a" />
          <path d="M6.8 18.2h9.4a3.3 3.3 0 0 0 .3-6.6 4.7 4.7 0 0 0-9-1.2 3.4 3.4 0 0 0-.7 7.8Z" fill="#ffffff" />
        </svg>
      </span>
    );
  }

  if (id === "battery") {
    return (
      <span className="wglyph" style={{ background: "#30d158" }} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="3.5" y="7.5" width="15" height="9" rx="2" stroke="#ffffff" strokeWidth="2" />
          <rect x="6" y="10" width="9" height="4" rx="0.8" fill="#ffffff" />
          <path d="M20.5 10.2v3.6" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  if (id === "system-stats") {
    return (
      <span className="wglyph" style={{ background: "#32ade6" }} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round">
          <path d="M5.5 16.5a7.5 7.5 0 1 1 13 0" />
          <path d="M12 12l3.8-3.8" />
        </svg>
      </span>
    );
  }

  if (id === "system-status") {
    return (
      <span className="wglyph" style={{ background: "#5e5ce6" }} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.1" strokeLinecap="round">
          <path d="M5 8h14M5 16h14" />
          <circle cx="9.5" cy="8" r="2.2" fill="#5e5ce6" />
          <circle cx="14.5" cy="16" r="2.2" fill="#5e5ce6" />
        </svg>
      </span>
    );
  }

  const color = CATEGORIES.find((c) => c.id === def?.category)?.color ?? "#6366f1";
  return (
    <span className="wglyph" style={{ background: color }} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1.5" />
        <rect x="13" y="4.5" width="6.5" height="6.5" rx="1.5" />
        <rect x="4.5" y="13" width="6.5" height="6.5" rx="1.5" />
        <rect x="13" y="13" width="6.5" height="6.5" rx="1.5" />
      </svg>
    </span>
  );
}

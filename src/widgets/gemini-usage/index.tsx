import { Fragment, useId } from "react";
import { defineWidget, type TileProps } from "../../core/widget";
import { Bar } from "../../design/parts/Bar";
import { Card } from "../../design/parts/Card";
import { Row } from "../../design/parts/Row";
import { Sparkline } from "../../design/parts/Sparkline";
import { Tile } from "../../design/parts/Tile";
import { durationText, pace, resetDayText, SESSION_MS, WEEK_MS, type LimitWindow } from "../../providers/claude";
import { forceRefreshGemini, GEMINI_SAMPLE, geminiProvider, type GeminiData } from "../../providers/gemini";
import "../_shared/ai-usage.css";

const HOW =
  "Shelf reads your Antigravity quotas through the official agy CLI and never touches your Google login. Sign in to Antigravity CLI on this PC, then press Check again.";

function GeminiLogo() {
  const gradId = useId();
  return (
    <span className="ai-logo--white gemini-logo" aria-hidden="true">
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

function TileRow({ label, win, reset }: { label: string; win: LimitWindow | null; reset: (ms: number) => string }) {
  return (
    <div className="ai-tile__row">
      <span className="ai-tile__label">{label}</span>
      <Bar percent={win?.percent ?? 0} level="good" thickness="calc(var(--T) * 0.065)" />
      <span className="ai-tile__reset">{win?.resetsAt ? reset(win.resetsAt) : ""}</span>
      <span className="ai-tile__value">{win ? `${Math.round(win.percent)}%` : "–"}</span>
    </div>
  );
}

function GeminiTile({ data }: TileProps<GeminiData>) {
  return (
    <Tile width={4.58} className="ai-tile">
      <div className="ai-tile__logo">
        <GeminiLogo />
      </div>
      <div className="ai-tile__rows">
        <TileRow label="Session" win={data?.session ?? null} reset={(ms) => durationText(ms - Date.now())} />
        <TileRow label="Weekly" win={data?.weekly ?? null} reset={resetDayText} />
      </div>
    </Tile>
  );
}

function Limit({ label, win, lengthMs, resets }: { label: string; win: LimitWindow | null; lengthMs: number; resets: (ms: number) => string }) {
  const now = Date.now();
  const projected = pace(win, lengthMs, now);
  return (
    <div className="ai-card__limit">
      <Row
        label={label}
        detail={win?.resetsAt ? `resets ${resets(win.resetsAt)}` : undefined}
        value={win ? `${Math.round(win.percent)}%` : "–"}
      />
      <Bar percent={win?.percent ?? 0} thickness="8px" />
      {projected?.hitsLimitAt && <p className="ai-card__pace">At this pace, the limit arrives in {durationText(projected.hitsLimitAt - now)}.</p>}
    </div>
  );
}

function GeminiCard({ data, status }: TileProps<GeminiData>) {
  if (status === "sample") {
    return (
      <Card logo={<GeminiLogo />} title="Antigravity" action={{ label: "Check again", onClick: forceRefreshGemini }}>
        <p className="ai-card__how">{HOW}</p>
      </Card>
    );
  }
  const history = data?.history ?? [];
  const primary = data?.groups.find((g) => g.name.toLowerCase().includes("gemini")) ?? data?.groups[0];
  const extras = (data?.groups ?? []).filter((g) => g !== primary);

  return (
    <Card
      logo={<GeminiLogo />}
      title="Gemini"
      pill={data?.plan ?? "Antigravity"}
      footer="Antigravity limits via agy CLI."
      action={{ label: "Refresh", onClick: forceRefreshGemini }}
    >
      <h2 className="card__section">{primary ? primary.name.toUpperCase() : "USAGE"}</h2>
      <Limit label="Session" win={data?.session ?? null} lengthMs={SESSION_MS} resets={(ms) => `in ${durationText(ms - Date.now())}`} />
      <Limit label="Weekly" win={data?.weekly ?? null} lengthMs={WEEK_MS} resets={resetDayText} />
      {extras.map((group) => (
        <Fragment key={group.name}>
          <h2 className="card__section">{group.name.toUpperCase()}</h2>
          <Limit label="Session" win={group.session} lengthMs={SESSION_MS} resets={(ms) => `in ${durationText(ms - Date.now())}`} />
          <Limit label="Weekly" win={group.weekly} lengthMs={WEEK_MS} resets={resetDayText} />
        </Fragment>
      ))}
      {history.length >= 2 && (
        <>
          <h2 className="card__section">TREND</h2>
          <div className="ai-card__chart">
            <Sparkline values={history} color="#4285f4" fill />
          </div>
        </>
      )}
    </Card>
  );
}

const geminiMenu = () => [{ label: "Refresh", onClick: forceRefreshGemini }];

export default defineWidget<GeminiData>({
  id: "gemini-usage",
  name: "Gemini (Antigravity)",
  description: "Your Antigravity limits: 5-hour session and weekly windows.",
  category: "ai",
  width: 4.58,
  sample: GEMINI_SAMPLE,
  Tile: GeminiTile,
  Card: GeminiCard,
  provider: geminiProvider,
  menu: geminiMenu,
});

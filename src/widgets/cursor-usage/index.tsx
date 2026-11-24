import { defineWidget, type TileProps } from "../../core/widget";
import { Bar } from "../../design/parts/Bar";
import { Card } from "../../design/parts/Card";
import { Row } from "../../design/parts/Row";
import { Sparkline } from "../../design/parts/Sparkline";
import { Tile } from "../../design/parts/Tile";
import { durationText, pace, resetDayText, type LimitWindow } from "../../providers/claude";
import { CURSOR_SAMPLE, cursorProvider, forceRefreshCursor, type CursorData } from "../../providers/cursor";
import { MONTH_MS } from "../../providers/grok";
import { formatCostUsd } from "../../providers/opencode";
import "../_shared/ai-usage.css";

const HOW =
  "Shelf checks your Cursor plan limits using Cursor's local sign-in directly from Rust and never exposes your token. Open Cursor and sign in, then press Check again.";

function CursorLogo() {
  return (
    <span className="ai-logo--dark cursor-logo" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 3.2 19.6 7.6v8.8L12 20.8 4.4 16.4V7.6L12 3.2Z" stroke="#f5f5f7" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 3.2v17.6M19.6 7.6 12 12 4.4 7.6" stroke="#f5f5f7" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function TileRow({ label, win }: { label: string; win: LimitWindow | null }) {
  return (
    <div className="ai-tile__row">
      <span className="ai-tile__label">{label}</span>
      <Bar percent={win?.percent ?? 0} level="good" thickness="calc(var(--T) * 0.065)" />
      <span className="ai-tile__reset">{win?.resetsAt ? resetDayText(win.resetsAt) : ""}</span>
      <span className="ai-tile__value">{win ? `${Math.round(win.percent)}%` : "–"}</span>
    </div>
  );
}

function CursorTile({ data }: TileProps<CursorData>) {
  return (
    <Tile width={4.58} className="ai-tile">
      <div className="ai-tile__logo">
        <CursorLogo />
      </div>
      <div className="ai-tile__rows">
        <TileRow label="Auto" win={data?.auto ?? null} />
        <TileRow label="API" win={data?.api ?? null} />
      </div>
    </Tile>
  );
}

function Limit({ label, win }: { label: string; win: LimitWindow | null }) {
  const now = Date.now();
  const projected = pace(win, MONTH_MS, now);
  return (
    <div className="ai-card__limit">
      <Row
        label={label}
        detail={win?.resetsAt ? `renews ${resetDayText(win.resetsAt)}` : undefined}
        value={win ? `${Math.round(win.percent)}%` : "–"}
      />
      <Bar percent={win?.percent ?? 0} thickness="8px" />
      {projected?.hitsLimitAt && <p className="ai-card__pace">At this pace, the limit arrives in {durationText(projected.hitsLimitAt - now)}.</p>}
    </div>
  );
}

function CursorCard({ data, status }: TileProps<CursorData>) {
  if (status === "sample") {
    return (
      <Card logo={<CursorLogo />} title="Cursor" action={{ label: "Check again", onClick: forceRefreshCursor }}>
        <p className="ai-card__how">{HOW}</p>
      </Card>
    );
  }

  const history = data?.history ?? [];
  return (
    <Card
      logo={<CursorLogo />}
      title="Cursor"
      pill={data?.plan ?? undefined}
      footer="Current Cursor billing cycle."
      action={{ label: "Refresh", onClick: forceRefreshCursor }}
    >
      <h2 className="card__section">USAGE</h2>
      <Limit label="Auto" win={data?.auto ?? null} />
      <Limit label="API" win={data?.api ?? null} />

      {(data?.renewalAt || typeof data?.onDemandCents === "number") && (
        <>
          <h2 className="card__section">BILLING</h2>
          {typeof data.onDemandCents === "number" && (
            <Row label="On-demand spend" value={formatCostUsd(data.onDemandCents / 100)} />
          )}
          {data.renewalAt && <Row label="Renewal" value={resetDayText(data.renewalAt)} />}
        </>
      )}

      {history.length >= 2 && (
        <>
          <h2 className="card__section">TREND</h2>
          <div className="ai-card__chart">
            <Sparkline values={history} color="var(--good)" fill />
          </div>
        </>
      )}
    </Card>
  );
}

const cursorMenu = () => [{ label: "Refresh", onClick: forceRefreshCursor }];

export default defineWidget<CursorData>({
  id: "cursor-usage",
  name: "Cursor Usage",
  description: "Your Cursor Auto and API plan limits and billing cycle renewal.",
  category: "ai",
  width: 4.58,
  sample: CURSOR_SAMPLE,
  Tile: CursorTile,
  Card: CursorCard,
  provider: cursorProvider,
  menu: cursorMenu,
});

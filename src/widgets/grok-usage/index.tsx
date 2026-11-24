import { defineWidget, type TileProps } from "../../core/widget";
import { Bar } from "../../design/parts/Bar";
import { Card } from "../../design/parts/Card";
import { Row } from "../../design/parts/Row";
import { Sparkline } from "../../design/parts/Sparkline";
import { Tile } from "../../design/parts/Tile";
import { durationText, pace, resetDayText, type LimitWindow } from "../../providers/claude";
import { forceRefreshGrok, GROK_SAMPLE, grokProvider, MONTH_MS, type GrokData } from "../../providers/grok";
import "../_shared/ai-usage.css";

const HOW =
  "Shelf queries Grok CLI's official billing interface (grok agent stdio) and never reads your xAI auth file directly. Sign in with Grok CLI (SuperGrok or X Premium+), then press Check again.";

function GrokLogo() {
  return (
    <span className="ai-logo--dark grok-logo" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="7.2" stroke="#f5f5f7" strokeWidth="2.1" />
        <path d="M8.2 15.8 17.5 6.5" stroke="#f5f5f7" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function GrokTile({ data }: TileProps<GrokData>) {
  const win = data?.credits ?? null;
  return (
    <Tile width={4.58} className="ai-tile">
      <div className="ai-tile__logo">
        <GrokLogo />
      </div>
      <div className="ai-tile__rows">
        <div className="ai-tile__row">
          <span className="ai-tile__label">Credits</span>
          <Bar percent={win?.percent ?? 0} level="good" thickness="calc(var(--T) * 0.065)" />
          <span className="ai-tile__reset">{win?.resetsAt ? resetDayText(win.resetsAt) : ""}</span>
          <span className="ai-tile__value">{win ? `${Math.round(win.percent)}%` : "–"}</span>
        </div>
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
        detail={win?.resetsAt ? `resets ${resetDayText(win.resetsAt)}` : undefined}
        value={win ? `${Math.round(win.percent)}%` : "–"}
      />
      <Bar percent={win?.percent ?? 0} thickness="8px" />
      {projected?.hitsLimitAt && <p className="ai-card__pace">At this pace, the limit arrives in {durationText(projected.hitsLimitAt - now)}.</p>}
    </div>
  );
}

function GrokCard({ data, status }: TileProps<GrokData>) {
  if (status === "sample") {
    return (
      <Card logo={<GrokLogo />} title="Grok" action={{ label: "Check again", onClick: forceRefreshGrok }}>
        <p className="ai-card__how">{HOW}</p>
      </Card>
    );
  }

  const history = data?.history ?? [];
  return (
    <Card
      logo={<GrokLogo />}
      title="Grok"
      pill={data?.plan ?? undefined}
      footer="Grok CLI credits via grok agent stdio."
      action={{ label: "Refresh", onClick: forceRefreshGrok }}
    >
      <h2 className="card__section">USAGE</h2>
      <Limit label="Credits" win={data?.credits ?? null} />
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

const grokMenu = () => [{ label: "Refresh", onClick: forceRefreshGrok }];

export default defineWidget<GrokData>({
  id: "grok-usage",
  name: "Grok Usage",
  description: "Your Grok CLI credit usage and renewal date.",
  category: "ai",
  width: 4.58,
  sample: GROK_SAMPLE,
  Tile: GrokTile,
  Card: GrokCard,
  provider: grokProvider,
  menu: grokMenu,
});

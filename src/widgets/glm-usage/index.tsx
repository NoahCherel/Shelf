import { useEffect, useState } from "react";
import { refresh } from "../../core/provider";
import { invoke } from "../../core/tauri";
import { defineWidget, type TileProps } from "../../core/widget";
import { Bar } from "../../design/parts/Bar";
import { Card } from "../../design/parts/Card";
import { ConnectCard } from "../../design/parts/ConnectCard";
import { Row } from "../../design/parts/Row";
import { Sparkline } from "../../design/parts/Sparkline";
import { Tile } from "../../design/parts/Tile";
import { durationText, pace, resetDayText, SESSION_MS, WEEK_MS, type LimitWindow } from "../../providers/claude";
import { clearGlmStore, fetchGlm, GLM_SAMPLE, GLM_SECRET, glmProvider, type GlmData } from "../../providers/glm";
import { MONTH_MS } from "../../providers/grok";
import "../_shared/ai-usage.css";

function GlmLogo() {
  return (
    <span className="ai-logo--teal glm-logo" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M5.5 6.5h13L6.2 17.5h12.3"
          stroke="#6ee7b7"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function TileRow({ label, win, reset }: { label: string; win: LimitWindow | null; reset: (ms: number) => string }) {
  return (
    <div className="ai-tile__row">
      <span className="ai-tile__label">{label}</span>
      <Bar percent={win?.percent ?? 0} level="good" thickness="calc(var(--T) * 0.055)" />
      <span className="ai-tile__reset">{win?.resetsAt ? reset(win.resetsAt) : ""}</span>
      <span className="ai-tile__value">{win ? `${Math.round(win.percent)}%` : "–"}</span>
    </div>
  );
}

function GlmTile({ data }: TileProps<GlmData>) {
  return (
    <Tile width={4.58} className="ai-tile">
      <div className="ai-tile__logo">
        <GlmLogo />
      </div>
      <div className="ai-tile__rows ai-tile__rows--three">
        <TileRow label="Session" win={data?.session ?? null} reset={(ms) => durationText(ms - Date.now())} />
        <TileRow label="Weekly" win={data?.weekly ?? null} reset={resetDayText} />
        <TileRow label="MCP" win={data?.mcp ?? null} reset={resetDayText} />
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

function disconnect(setConnected: (on: boolean) => void) {
  Promise.all([
    invoke("secret_delete", { id: GLM_SECRET }).catch(() => {}),
    clearGlmStore(),
  ]).finally(() => {
    setConnected(false);
    refresh(glmProvider);
  });
}

function GlmCard({ data, status, error }: TileProps<GlmData>) {
  const [connected, setConnected] = useState(status !== "sample");
  useEffect(() => setConnected(status !== "sample"), [status]);

  if (!connected || !data) {
    if (status === "error" && error) {
      return (
        <Card
          logo={<GlmLogo />}
          title="GLM"
          footer={error.message}
          action={{ label: "Disconnect", onClick: () => disconnect(setConnected), danger: true }}
        />
      );
    }
    return (
      <Card logo={<GlmLogo />} title="GLM">
        <ConnectCard
          guide="Paste your Z.ai or Zhipu BigModel Coding Plan API key. Shelf detects your platform automatically and stores the key encrypted on this PC."
          fields={[{ id: GLM_SECRET, label: "Coding Plan key", placeholder: "API key…", secret: true }]}
          onConnect={async () => {
            await fetchGlm();
            refresh(glmProvider);
          }}
        />
      </Card>
    );
  }

  const history = data.history ?? [];
  const platform = data.region === "bigmodel" ? "BigModel" : "Z.ai";

  return (
    <Card
      logo={<GlmLogo />}
      title="GLM"
      pill={platform}
      footer={error?.message ?? `${platform} Coding Plan limits.`}
      action={{ label: "Disconnect", onClick: () => disconnect(setConnected), danger: true }}
    >
      <h2 className="card__section">USAGE</h2>
      <Limit label="Session" win={data.session} lengthMs={SESSION_MS} resets={(ms) => `in ${durationText(ms - Date.now())}`} />
      {data.weekly && <Limit label="Weekly" win={data.weekly} lengthMs={WEEK_MS} resets={resetDayText} />}
      {data.mcp && <Limit label="MCP" win={data.mcp} lengthMs={MONTH_MS} resets={resetDayText} />}

      {data.mcpDetails.length > 0 && (
        <>
          <h2 className="card__section">MCP TOOLS</h2>
          {data.mcpDetails.map((item) => (
            <Row key={item.name} label={item.name} value={String(item.usage)} />
          ))}
        </>
      )}

      {history.length >= 2 && (
        <>
          <h2 className="card__section">TREND</h2>
          <div className="ai-card__chart">
            <Sparkline values={history} color="#6ee7b7" fill />
          </div>
        </>
      )}
    </Card>
  );
}

const glmMenu = () => [
  { label: "Refresh", onClick: () => refresh(glmProvider) },
  { label: "Logout", danger: true, onClick: () => disconnect(() => {}) },
];

export default defineWidget<GlmData>({
  id: "glm-usage",
  name: "GLM Usage",
  description: "Z.ai / BigModel Coding Plan limits for Session, Weekly and MCP.",
  category: "ai",
  width: 4.58,
  sample: GLM_SAMPLE,
  Tile: GlmTile,
  Card: GlmCard,
  provider: glmProvider,
  menu: glmMenu,
});

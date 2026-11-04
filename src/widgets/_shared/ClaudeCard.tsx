import { useState } from "react";
import { refresh } from "../../core/provider";
import { invoke } from "../../core/tauri";
import type { TileProps } from "../../core/widget";
import { Bar } from "../../design/parts/Bar";
import { Card } from "../../design/parts/Card";
import { Row } from "../../design/parts/Row";
import { claudeProvider, durationText, pace, resetDayText, SESSION_MS, WEEK_MS, type ClaudeData, type LimitWindow } from "../_providers/claude";
import { ClaudeLogo } from "./ClaudeLogo";

const HOW = "Shelf reads the limits Claude Code hands its status line, and never your Claude login. They update while Claude Code is running.";

function Limit({ label, win, lengthMs, resets }: { label: string; win: LimitWindow | null; lengthMs: number; resets: (ms: number) => string }) {
  const now = Date.now();
  const projected = pace(win, lengthMs, now);
  return (
    <div className="claude-limit">
      <Row
        label={label}
        detail={win?.resetsAt ? `resets ${resets(win.resetsAt)}` : undefined}
        value={win ? `${Math.round(win.percent)}%` : "–"}
      />
      <Bar percent={win?.percent ?? 0} thickness="8px" />
      {projected?.hitsLimitAt && <p className="claude-limit__pace">At this pace, the limit arrives in {durationText(projected.hitsLimitAt - now)}.</p>}
    </div>
  );
}

export const claudeMenu = () => [
  {
    label: "Logout",
    danger: true,
    onClick: () => void invoke("claude_connect", { on: false }).then(() => refresh(claudeProvider), () => {}),
  },
];

export function ClaudeCard({ data, status }: TileProps<ClaudeData>) {
  const [error, setError] = useState<string | null>(null);
  const connect = (on: boolean) => {
    setError(null);
    invoke("claude_connect", { on }).then(
      () => refresh(claudeProvider),
      (e) => setError(String(e)),
    );
  };

  if (status === "sample") {
    return (
      <Card logo={<ClaudeLogo />} title="Claude" footer={error} action={{ label: "Connect", onClick: () => connect(true) }}>
        <p className="claude-how">{HOW}</p>
      </Card>
    );
  }
  return (
    <Card
      logo={<ClaudeLogo />}
      title="Claude"
      footer={error ?? "From Claude Code's status line."}
      action={{ label: "Disconnect", onClick: () => connect(false), danger: true }}
    >
      <h2 className="card__section">USAGE</h2>
      <Limit label="Session" win={data?.session ?? null} lengthMs={SESSION_MS} resets={(ms) => durationText(ms - Date.now())} />
      <Limit label="Weekly" win={data?.weekly ?? null} lengthMs={WEEK_MS} resets={resetDayText} />
    </Card>
  );
}

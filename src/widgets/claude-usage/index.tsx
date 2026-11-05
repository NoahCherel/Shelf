import { defineWidget, type TileProps } from "../../core/widget";
import { Bar } from "../../design/parts/Bar";
import { Tile } from "../../design/parts/Tile";
import { CLAUDE_SAMPLE, claudeProvider, durationText, type ClaudeData } from "../_providers/claude";
import { ClaudeCard, claudeMenu } from "../_shared/ClaudeCard";
import { ClaudeLogo } from "../_shared/ClaudeLogo";
import "./claude-usage.css";

function ClaudeUsageTile({ data }: TileProps<ClaudeData>) {
  const win = data?.session ?? null;
  return (
    <Tile width={2.74} className="cu">
      <div className="cu__logo">
        <ClaudeLogo />
      </div>
      <div className="cu__main">
        <div className="cu__top">
          <span className="cu__label">Session</span>
          {win?.resetsAt && <span className="cu__time">{durationText(win.resetsAt - Date.now())}</span>}
        </div>
        <span className="cu__value">{win ? `${Math.round(win.percent)}%` : "–"}</span>
        <Bar percent={win?.percent ?? 0} level="good" />
      </div>
    </Tile>
  );
}

export default defineWidget<ClaudeData>({
  id: "claude-usage",
  name: "Claude Usage",
  description: "Your Claude session limit and when it resets.",
  category: "ai",
  width: 2.74,
  sample: CLAUDE_SAMPLE,
  Tile: ClaudeUsageTile,
  Card: ClaudeCard,
  provider: claudeProvider,
  menu: claudeMenu,
});

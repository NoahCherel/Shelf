import { defineWidget, type TileProps } from "../../core/widget";
import { Bar } from "../../design/parts/Bar";
import { Tile } from "../../design/parts/Tile";
import { CLAUDE_SAMPLE, claudeProvider, durationText, resetDayText, tokensText, type ClaudeData, type LimitWindow } from "../../providers/claude";
import { ClaudeCard, claudeMenu } from "../_shared/ClaudeCard";
import { ClaudeLogo } from "../_shared/ClaudeLogo";
import "./claude-plan-usage.css";

function PlanRow({ label, win, reset }: { label: string; win: LimitWindow | null; reset: (ms: number) => string }) {
  return (
    <div className="plan__row">
      <span className="plan__label">{label}</span>
      <Bar percent={win?.percent ?? 0} level="good" thickness="calc(var(--T) * 0.065)" />
      <span className="plan__reset">{win?.resetsAt ? reset(win.resetsAt) : ""}</span>
      <span className="plan__value">{win ? `${Math.round(win.percent)}%` : "–"}</span>
    </div>
  );
}

function ClaudePlanTile({ data }: TileProps<ClaudeData>) {
  const model = data?.topModel ?? null;
  return (
    <Tile width={5.06} className="plan">
      <div className="plan__logo">
        <ClaudeLogo />
      </div>
      <div className={model ? "plan__rows plan__rows--three" : "plan__rows"}>
        <PlanRow label="Session" win={data?.session ?? null} reset={(ms) => durationText(ms - Date.now())} />
        <PlanRow label="Weekly" win={data?.weekly ?? null} reset={resetDayText} />
        {model && (
          <div className="plan__row plan__row--model">
            <span className="plan__model">{model.name}</span>
            <span className="plan__tag">most used</span>
            <span className="plan__tokens">{tokensText(model.tokens)}</span>
          </div>
        )}
      </div>
    </Tile>
  );
}

export default defineWidget<ClaudeData>({
  id: "claude-plan-usage",
  name: "Claude Plan Usage",
  description: "Claude's session and weekly limits side by side, with the model you use most.",
  category: "ai",
  width: 5.06,
  sample: CLAUDE_SAMPLE,
  Tile: ClaudePlanTile,
  Card: ClaudeCard,
  provider: claudeProvider,
  menu: claudeMenu,
});

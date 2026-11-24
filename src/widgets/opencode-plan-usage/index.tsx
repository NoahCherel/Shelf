import { defineWidget, type TileProps } from "../../core/widget";
import { Bar } from "../../design/parts/Bar";
import { Tile } from "../../design/parts/Tile";
import { tokensText } from "../../providers/claude";
import { OPENCODE_SAMPLE, opencodeProvider, type OpenCodeData } from "../../providers/opencode";
import { OpenCodeCard, opencodeMenu } from "../_shared/OpenCodeCard";
import { OpenCodeLogo } from "../_shared/OpenCodeLogo";
import "./opencode-plan-usage.css";

function gaugePercent(tokens: number, scale: number): number {
  if (tokens <= 0 || scale <= 0) return 0;
  return Math.min(100, Math.max(4, Math.round((tokens / scale) * 100)));
}

function OpenCodePlanTile({ data }: TileProps<OpenCodeData>) {
  const sessionTokens = data?.session?.tokens ?? 0;
  const weeklyTokens = data?.weekly?.tokens ?? 0;
  const model = data?.topModel ?? null;
  const scale = Math.max(weeklyTokens, 1_000_000);

  return (
    <Tile width={4.53} className="ocp">
      <div className="ocp__logo">
        <OpenCodeLogo />
      </div>
      <div className="ocp__rows">
        <div className="ocp__row">
          <span className="ocp__label">Session</span>
          <Bar percent={gaugePercent(sessionTokens, Math.max(weeklyTokens, 250_000))} level="good" thickness="calc(var(--T) * 0.055)" />
          <span className="ocp__sub">last 5h</span>
          <span className="ocp__value">{data ? tokensText(sessionTokens) : "–"}</span>
        </div>
        <div className="ocp__row">
          <span className="ocp__label">Weekly</span>
          <Bar percent={gaugePercent(weeklyTokens, scale)} level="good" thickness="calc(var(--T) * 0.055)" />
          <span className="ocp__sub">last 7d</span>
          <span className="ocp__value">{data ? tokensText(weeklyTokens) : "–"}</span>
        </div>
        {model && (
          <div className="ocp__row ocp__row--model">
            <span className="ocp__model">{model.name}</span>
            <span className="ocp__sub">most used</span>
            <span className="ocp__tokens">{tokensText(model.tokens)}</span>
          </div>
        )}
      </div>
    </Tile>
  );
}

export default defineWidget<OpenCodeData>({
  id: "opencode-plan-usage",
  name: "OpenCode Plan Usage",
  description: "OpenCode session and weekly token gauges side by side with your top model.",
  category: "ai",
  width: 4.53,
  sample: OPENCODE_SAMPLE,
  Tile: OpenCodePlanTile,
  Card: OpenCodeCard,
  provider: opencodeProvider,
  menu: opencodeMenu,
});

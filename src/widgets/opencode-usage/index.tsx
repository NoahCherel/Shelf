import { defineWidget, type TileProps } from "../../core/widget";
import { Tile } from "../../design/parts/Tile";
import { tokensText } from "../../providers/claude";
import { OPENCODE_SAMPLE, opencodeProvider, type OpenCodeData } from "../../providers/opencode";
import { OpenCodeCard, opencodeMenu } from "../_shared/OpenCodeCard";
import { OpenCodeLogo } from "../_shared/OpenCodeLogo";
import "./opencode-usage.css";

function OpenCodeUsageTile({ data }: TileProps<OpenCodeData>) {
  const tokens = data?.session?.tokens;
  return (
    <Tile width={2.83} className="oc">
      <div className="oc__logo">
        <OpenCodeLogo />
      </div>
      <div className="oc__main">
        <div className="oc__top">
          <span className="oc__label">Session</span>
          <span className="oc__sub">last 5h</span>
        </div>
        <span className="oc__value">{typeof tokens === "number" ? tokensText(tokens) : "–"}</span>
      </div>
    </Tile>
  );
}

export default defineWidget<OpenCodeData>({
  id: "opencode-usage",
  name: "OpenCode Usage",
  description: "Local OpenCode token usage and cost over the last 5 hours, read offline.",
  category: "ai",
  width: 2.83,
  sample: OPENCODE_SAMPLE,
  Tile: OpenCodeUsageTile,
  Card: OpenCodeCard,
  provider: opencodeProvider,
  menu: opencodeMenu,
});

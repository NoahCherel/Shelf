import { refresh } from "../../core/provider";
import type { TileProps } from "../../core/widget";
import { Card } from "../../design/parts/Card";
import { Row } from "../../design/parts/Row";
import { Sparkline } from "../../design/parts/Sparkline";
import { tokensText } from "../../providers/claude";
import { formatCostUsd, opencodeProvider, type OpenCodeData } from "../../providers/opencode";
import { OpenCodeLogo } from "./OpenCodeLogo";
import "./ai-usage.css";

const HOW =
  "Shelf reads OpenCode's local session history offline on this PC and never sends anything over the network. Use OpenCode on this PC, then press Check again.";

export const opencodeMenu = () => [{ label: "Refresh", onClick: () => refresh(opencodeProvider) }];

export function OpenCodeCard({ data, status }: TileProps<OpenCodeData>) {
  if (status === "sample" || !data) {
    return (
      <Card logo={<OpenCodeLogo />} title="OpenCode" action={{ label: "Check again", onClick: () => refresh(opencodeProvider) }}>
        <p className="ai-card__how">{HOW}</p>
      </Card>
    );
  }

  const daily = data.dailyTokens ?? [];
  return (
    <Card
      logo={<OpenCodeLogo />}
      title="OpenCode"
      pill="Offline"
      footer="Read locally from OpenCode's history."
      action={{ label: "Refresh", onClick: () => refresh(opencodeProvider) }}
    >
      <h2 className="card__section">SESSION (5H)</h2>
      <Row label="Tokens" detail={`${data.session.messages} responses`} value={tokensText(data.session.tokens)} />
      <Row
        label="Cost"
        detail={`in ${tokensText(data.session.input)} · out ${tokensText(data.session.output)}`}
        value={formatCostUsd(data.session.cost)}
      />

      <h2 className="card__section">WEEKLY (7D)</h2>
      <Row label="Tokens" detail={`${data.weekly.messages} responses`} value={tokensText(data.weekly.tokens)} />
      <Row label="Cost" detail={`cache ${tokensText(data.weekly.cache)}`} value={formatCostUsd(data.weekly.cost)} />

      {data.models.length > 0 ? (
        <>
          <h2 className="card__section">MODELS (7D)</h2>
          {data.models.map((m, i) => (
            <Row
              key={m.name}
              label={m.name}
              detail={i === 0 ? "most used" : undefined}
              value={`${tokensText(m.tokens)} · ${m.cost > 0 ? formatCostUsd(m.cost) : "Free"}`}
            />
          ))}
        </>
      ) : (
        data.allTime &&
        data.allTime.tokens > 0 && (
          <>
            <h2 className="card__section">ALL TIME</h2>
            <Row label="Tokens" detail={`${data.allTime.messages} responses`} value={tokensText(data.allTime.tokens)} />
            {(data.allTimeModels ?? []).map((m, i) => (
              <Row
                key={m.name}
                label={m.name}
                detail={i === 0 ? "most used" : undefined}
                value={`${tokensText(m.tokens)} · ${m.cost > 0 ? formatCostUsd(m.cost) : "Free"}`}
              />
            ))}
          </>
        )
      )}

      {daily.some((v) => v > 0) && daily.length >= 2 && (
        <>
          <h2 className="card__section">TREND (7D)</h2>
          <div className="ai-card__chart">
            <Sparkline values={daily} color="var(--good)" fill />
          </div>
        </>
      )}
    </Card>
  );
}

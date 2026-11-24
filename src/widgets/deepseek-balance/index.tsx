import { useEffect, useState } from "react";
import { refresh } from "../../core/provider";
import { invoke } from "../../core/tauri";
import { defineWidget, type TileProps } from "../../core/widget";
import { Card } from "../../design/parts/Card";
import { ConnectCard } from "../../design/parts/ConnectCard";
import { Row } from "../../design/parts/Row";
import { Sparkline } from "../../design/parts/Sparkline";
import { Tile } from "../../design/parts/Tile";
import {
  clearDeepSeekHistory,
  DEEPSEEK_SAMPLE,
  DEEPSEEK_SECRET,
  deepseekProvider,
  fetchDeepSeek,
  formatDeepSeekMoney,
  type DeepSeekData,
} from "../../providers/deepseek";
import "../_shared/ai-usage.css";

function DeepSeekLogo() {
  return (
    <span className="ai-logo--blue deepseek-logo" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M4.5 14.5c1.2 2.8 4.4 4.5 8 4.5 4.2 0 7-2.6 7-5.9 0-2.5-1.6-4.5-4.3-4.9-.8-2.2-2.7-3.4-5.2-3.4-1.5 0-2.8.5-3.8 1.4 1.3.2 2.2 1 2.4 2.1-2.5.9-4.1 3.3-4.1 6.2Z"
          fill="#ffffff"
        />
        <circle cx="14.6" cy="11.8" r="1.2" fill="#4d6bfe" />
      </svg>
    </span>
  );
}

function DeepSeekTile({ data }: TileProps<DeepSeekData>) {
  const cur = data?.currency ?? "USD";
  const fmt = (n: number | undefined) => (typeof n === "number" ? formatDeepSeekMoney(n, cur) : "–");
  return (
    <Tile width={4.58} className="ai-tile">
      <div className="ai-tile__logo">
        <DeepSeekLogo />
      </div>
      <div className="ai-tile__rows ai-tile__rows--three">
        <div className="ai-tile__row--kv">
          <span className="ai-tile__label">Balance</span>
          <span className="ai-tile__value">{fmt(data?.total)}</span>
        </div>
        <div className="ai-tile__row--kv">
          <span className="ai-tile__sub">Today</span>
          <span className="ai-tile__reset">{fmt(data?.today)}</span>
        </div>
        <div className="ai-tile__row--kv">
          <span className="ai-tile__sub">7 days</span>
          <span className="ai-tile__reset">{fmt(data?.week)}</span>
        </div>
      </div>
    </Tile>
  );
}

function disconnect(setConnected: (on: boolean) => void) {
  Promise.all([
    invoke("secret_delete", { id: DEEPSEEK_SECRET }).catch(() => {}),
    clearDeepSeekHistory(),
  ]).finally(() => {
    setConnected(false);
    refresh(deepseekProvider);
  });
}

function DeepSeekCard({ data, status, error }: TileProps<DeepSeekData>) {
  const [connected, setConnected] = useState(status !== "sample");
  useEffect(() => setConnected(status !== "sample"), [status]);

  if (!connected || !data) {
    if (status === "error" && error) {
      return (
        <Card
          logo={<DeepSeekLogo />}
          title="DeepSeek"
          footer={error.message}
          action={{ label: "Disconnect", onClick: () => disconnect(setConnected), danger: true }}
        />
      );
    }
    return (
      <Card logo={<DeepSeekLogo />} title="DeepSeek">
        <ConnectCard
          guide="Paste a DeepSeek API key. It's stored encrypted on this PC and only ever goes to api.deepseek.com to read your balance."
          fields={[{ id: DEEPSEEK_SECRET, label: "API key", placeholder: "sk-…", secret: true }]}
          onConnect={async () => {
            await fetchDeepSeek();
            refresh(deepseekProvider);
          }}
        />
      </Card>
    );
  }

  const cur = data.currency;
  const runway =
    data.daysLeft !== null
      ? `~${data.daysLeft} day${data.daysLeft === 1 ? "" : "s"}`
      : data.trackingSamples < 2
        ? "Tracking started"
        : "No spend yet";

  return (
    <Card
      logo={<DeepSeekLogo />}
      title="DeepSeek"
      pill={data.isAvailable ? cur : "Empty"}
      footer={error?.message ?? "Spend is calculated locally from balance changes."}
      action={{ label: "Disconnect", onClick: () => disconnect(setConnected), danger: true }}
    >
      <h2 className="card__section">BALANCE</h2>
      <Row label="Total" value={formatDeepSeekMoney(data.total, cur)} />
      <Row label="Topped up" value={formatDeepSeekMoney(data.toppedUp, cur)} />
      {data.granted > 0 && <Row label="Granted" value={formatDeepSeekMoney(data.granted, cur)} />}

      <h2 className="card__section">SPEND</h2>
      <Row label="Today" value={formatDeepSeekMoney(data.today, cur)} />
      <Row label="7 days" value={formatDeepSeekMoney(data.week, cur)} />
      <Row label="Runway" detail="at 7d pace" value={runway} />

      {data.dailySpend.some((v) => v > 0) && (
        <>
          <h2 className="card__section">TREND (7D)</h2>
          <div className="ai-card__chart">
            <Sparkline values={data.dailySpend} color="#4d6bfe" fill />
          </div>
        </>
      )}
    </Card>
  );
}

const deepseekMenu = () => [
  { label: "Refresh", onClick: () => refresh(deepseekProvider) },
  { label: "Logout", danger: true, onClick: () => disconnect(() => {}) },
];

export default defineWidget<DeepSeekData>({
  id: "deepseek-balance",
  name: "DeepSeek Balance",
  description: "Your DeepSeek API credit balance and local daily spend.",
  category: "ai",
  width: 4.58,
  sample: DEEPSEEK_SAMPLE,
  Tile: DeepSeekTile,
  Card: DeepSeekCard,
  provider: deepseekProvider,
  menu: deepseekMenu,
});

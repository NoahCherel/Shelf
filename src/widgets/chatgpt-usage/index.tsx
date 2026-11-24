import { refresh } from "../../core/provider";
import { defineWidget, type TileProps } from "../../core/widget";
import { Bar } from "../../design/parts/Bar";
import { Card } from "../../design/parts/Card";
import { Row } from "../../design/parts/Row";
import { Sparkline } from "../../design/parts/Sparkline";
import { Tile } from "../../design/parts/Tile";
import { CHATGPT_SAMPLE, chatgptProvider, type ChatGptData } from "../../providers/chatgpt";
import { durationText, pace, resetDayText, SESSION_MS, WEEK_MS, type LimitWindow } from "../../providers/claude";
import "../_shared/ai-usage.css";

const HOW =
  "Shelf reads the rate limits Codex CLI writes to its local session logs, and never your ChatGPT login. Sign in with Codex CLI, run a prompt, then press Check again.";

function ChatGptLogo() {
  return (
    <span className="ai-logo--white chatgpt-logo" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.2a4.3 4.3 0 0 1 4.1 3A4.3 4.3 0 0 1 19 12a4.3 4.3 0 0 1-2.9 5.8A4.3 4.3 0 0 1 12 20.8a4.3 4.3 0 0 1-4.1-3A4.3 4.3 0 0 1 5 12a4.3 4.3 0 0 1 2.9-5.8A4.3 4.3 0 0 1 12 3.2Z" />
        <polygon points="12,8.4 15.1,10.2 15.1,13.8 12,15.6 8.9,13.8 8.9,10.2" />
      </svg>
    </span>
  );
}

function TileRow({ label, win, reset }: { label: string; win: LimitWindow | null; reset: (ms: number) => string }) {
  return (
    <div className="ai-tile__row">
      <span className="ai-tile__label">{label}</span>
      <Bar percent={win?.percent ?? 0} level="good" thickness="calc(var(--T) * 0.065)" />
      <span className="ai-tile__reset">{win?.resetsAt ? reset(win.resetsAt) : ""}</span>
      <span className="ai-tile__value">{win ? `${Math.round(win.percent)}%` : "–"}</span>
    </div>
  );
}

function ChatGptTile({ data }: TileProps<ChatGptData>) {
  return (
    <Tile width={4.58} className="ai-tile">
      <div className="ai-tile__logo">
        <ChatGptLogo />
      </div>
      <div className="ai-tile__rows">
        <TileRow label="Session" win={data?.session ?? null} reset={(ms) => durationText(ms - Date.now())} />
        <TileRow label="Weekly" win={data?.weekly ?? null} reset={resetDayText} />
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

function ChatGptCard({ data, status }: TileProps<ChatGptData>) {
  if (status === "sample") {
    return (
      <Card logo={<ChatGptLogo />} title="ChatGPT" action={{ label: "Check again", onClick: () => refresh(chatgptProvider) }}>
        <p className="ai-card__how">{HOW}</p>
      </Card>
    );
  }
  const history = data?.history ?? [];
  return (
    <Card
      logo={<ChatGptLogo />}
      title="ChatGPT"
      pill={data?.plan ?? undefined}
      footer="Codex limits from local session logs."
      action={{ label: "Refresh", onClick: () => refresh(chatgptProvider) }}
    >
      <h2 className="card__section">USAGE</h2>
      <Limit label="Session" win={data?.session ?? null} lengthMs={data?.session?.windowMs ?? SESSION_MS} resets={(ms) => durationText(ms - Date.now())} />
      <Limit label="Weekly" win={data?.weekly ?? null} lengthMs={data?.weekly?.windowMs ?? WEEK_MS} resets={resetDayText} />
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

const chatgptMenu = () => [{ label: "Refresh", onClick: () => refresh(chatgptProvider) }];

export default defineWidget<ChatGptData>({
  id: "chatgpt-usage",
  name: "ChatGPT Usage",
  description: "Codex usage on your ChatGPT plan, for the 5-hour and the weekly limit.",
  category: "ai",
  width: 4.58,
  sample: CHATGPT_SAMPLE,
  Tile: ChatGptTile,
  Card: ChatGptCard,
  provider: chatgptProvider,
  menu: chatgptMenu,
});

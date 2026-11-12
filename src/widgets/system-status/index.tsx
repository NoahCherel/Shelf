import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { invoke } from "../../core/tauri";
import { useDockIds } from "../../core/dockIds";
import { openPanel, statusChanged, type PanelId } from "../../panels/open";
import { defineWidget, type TileProps } from "../../core/widget";
import { Tile } from "../../design/parts/Tile";
import { signalBars, statusProvider, type StatusData } from "../../providers/status";
import "./system-status.css";

const PART = 0.56;
const PADDING = 0.16;

const PARTS = 5;

function widthFor() {
  return PARTS * PART + PADDING;
}

function Wave({ d, on }: { d: string; on: boolean }) {
  return <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity={on ? 1 : 0.28} />;
}

function NetworkGlyph({ data }: { data: StatusData | null }) {
  const wifi = data?.wifi ?? null;
  if (wifi) {
    const bars = signalBars(wifi.signal);
    return (
      <svg viewBox="0 0 24 24" data-net={`wifi-${bars}`} aria-hidden="true">
        <circle cx="12" cy="18.500" r="1.800" fill="currentColor" />
        <Wave d="M8.700 15a4.700 4.700 0 0 1 6.600 0" on={bars >= 2} />
        <Wave d="M5.500 11.700a9.200 9.200 0 0 1 13 0" on={bars >= 3} />
        <Wave d="M2.500 8.500a13.500 13.500 0 0 1 19 0" on={bars >= 4} />
      </svg>
    );
  }
  if (data?.online) {
    return (
      <svg viewBox="0 0 24 24" data-net="wired" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <rect x="3.500" y="4.500" width="17" height="11.500" rx="2" />
        <path d="M12 16v3.500M7.500 20h9" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" data-net="offline" aria-hidden="true">
      <circle cx="12" cy="18.500" r="1.800" fill="currentColor" opacity="0.4" />
      <Wave d="M5.500 11.700a9.200 9.200 0 0 1 13 0" on={false} />
      <Wave d="M2.500 8.500a13.500 13.500 0 0 1 19 0" on={false} />
      <path d="M4 3.500l16 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SoundGlyph({ data }: { data: StatusData | null }) {
  const muted = data?.volume?.muted ?? false;
  const percent = data?.volume?.percent ?? 0;
  return (
    <svg viewBox="0 0 24 24" data-muted={muted} aria-hidden="true">
      <path d="M3.500 9.500v5h3.500l5 4.500v-14l-5 4.500h-3.500Z" fill="currentColor" />
      {muted ? (
        <path d="M15.500 9.500l5 5m0-5l-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <>
          <Wave d="M15 9.500a4 4 0 0 1 0 5" on={percent > 0} />
          <Wave d="M17.500 7a7.500 7.500 0 0 1 0 10" on={percent >= 50} />
        </>
      )}
    </svg>
  );
}

function BatteryGlyph({ battery }: { battery: NonNullable<StatusData["battery"]> }) {
  const low = !battery.charging && battery.percent <= 20;
  const fill = Math.max(1.500, (Math.min(100, battery.percent) / 100) * 15);
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="7" width="18" height="10" rx="2.500" fill="none" stroke="currentColor" strokeWidth="1.600" opacity="0.7" />
      <rect x="20.800" y="10" width="1.800" height="4" rx="0.900" fill="currentColor" opacity="0.7" />
      <rect x="3.500" y="8.500" width={fill} height="7" rx="1.200" fill={low ? "var(--warn)" : "currentColor"} />
      {battery.charging && <path d="M12.500 6l-4 6.500h3l-1 5.500 4.500-7h-3.200l.700-5Z" fill="var(--good)" stroke="var(--card)" strokeWidth="0.600" />}
    </svg>
  );
}

function BellGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.900" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d="M6 16.500V11a6 6 0 0 1 12 0v5.500l1.500 2h-15l1.500-2Z" />
      <path d="M10 21h4" />
    </svg>
  );
}

function Part({ label, title, panel, preview, onScroll, children }: { label: string; title?: string; panel: PanelId; preview?: boolean; onScroll?: (up: boolean) => void; children: ReactNode }) {
  const open = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (preview) return;
    openPanel(panel, e.currentTarget);
  };
  return (
    <button
      type="button"
      className="status__part"
      aria-label={label}
      title={title ?? label}
      onClick={open}
      onWheel={(e) => !preview && onScroll?.(e.deltaY < 0)}
      data-own-wheel={onScroll ? "" : undefined}
    >
      {children}
    </button>
  );
}

function SlidersGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 8h9M19 8h1M4 16h1M11 16h9" />
      <circle cx="16" cy="8" r="2.500" />
      <circle cx="8" cy="16" r="2.500" />
    </svg>
  );
}

function networkTitle(data: StatusData | null): string {
  if (data?.wifi) return `${data.wifi.ssid} (${data.wifi.signal}%)`;
  return data?.online ? "Connected" : "Not connected";
}

const SCROLL_STEP = 2;
const MOST_COUNTED = 9;

function stepVolume(percent: number, up: boolean): number {
  return Math.min(100, Math.max(0, percent + (up ? SCROLL_STEP : -SCROLL_STEP)));
}

function StatusTile({ data, preview }: TileProps<StatusData>) {
  const batteryWidget = useDockIds((s) => s.ids.includes("battery"));
  // Several scroll steps can land before the next reading, so they add up from the last one.
  const scrolled = useRef<number | null>(null);
  const reading = data?.volume?.percent;
  useEffect(() => {
    scrolled.current = null;
  }, [reading]);
  return (
    <Tile width={widthFor()} className="status">
      <button
        type="button"
        className="status__part"
        aria-label="Hidden icons"
        title="Hidden icons"
        onClick={(e) => {
          e.stopPropagation();
          if (preview) return;
          const r = e.currentTarget.getBoundingClientRect();
          invoke("tray_toggle", { tileX: r.left, tileWidth: r.width }).catch(() => {});
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 14.500 12 8.500l6 6" />
        </svg>
      </button>
      <Part label="Network" title={networkTitle(data)} panel="wifi" preview={preview}>
        <NetworkGlyph data={data} />
      </Part>
      <Part
        label="Sound"
        title={data?.volume ? `${data.volume.percent}%` : "Sound"}
        panel="sound"
        preview={preview}
        onScroll={(up) => {
          if (!data?.volume) return;
          const percent = stepVolume(data.volume.percent + (scrolled.current ?? 0), up);
          scrolled.current = percent - data.volume.percent;
          invoke("audio_set_volume", { percent }).then(statusChanged, () => {});
        }}
      >
        <SoundGlyph data={data} />
      </Part>
      {data?.battery && !batteryWidget ? (
        <Part label="Battery" title={`${data.battery.percent}%`} panel="quick" preview={preview}>
          <BatteryGlyph battery={data.battery} />
        </Part>
      ) : (
        <Part label="Quick settings" panel="quick" preview={preview}>
          <SlidersGlyph />
        </Part>
      )}
      <Part label="Notifications" panel="notifications" preview={preview}>
        <BellGlyph />
        {(data?.notifications ?? 0) > 0 && <span className="status__count">{data!.notifications! > MOST_COUNTED ? `${MOST_COUNTED}+` : data!.notifications}</span>}
      </Part>
    </Tile>
  );
}

export default defineWidget<StatusData>({
  id: "system-status",
  name: "Status",
  description: "Wi-Fi, sound, battery and notifications, opening their cards.",
  category: "system",
  width: widthFor,
  sample: {
    wifi: { ssid: "Home", signal: 90 },
    online: true,
    volume: { percent: 60, muted: false },
    battery: { percent: 80, charging: false },
  },
  Tile: StatusTile,
  provider: statusProvider,
});

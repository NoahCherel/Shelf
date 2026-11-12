import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { coalesced } from "../../core/coalesced";
import { refresh } from "../../core/provider";
import { invoke } from "../../core/tauri";
import { useProvider } from "../../core/useProvider";
import { Card } from "../../design/parts/Card";
import { SettingsLink } from "../../design/parts/SettingsLink";
import { Slider } from "../../design/parts/Slider";
import { quickProvider, type ToggleKind } from "../../widgets/_providers/quick";
import { statusProvider } from "../../widgets/_providers/status";
import { goToPanel, statusChanged } from "../open";
import { VolumeRow } from "../sound/VolumeRow";
import "./quick.css";

const BRIGHTNESS_EVERY_MS = 150;
/** How long a switch shows what was asked before believing Windows' reading again. */
const TRUST_READING_AFTER_MS = 4000;

type SwitchKey = "wifi" | "bluetooth" | ToggleKind;

function glyph(children: ReactNode) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const WIFI = glyph(
  <>
    <circle cx="12" cy="18.500" r="1.800" fill="currentColor" stroke="none" />
    <path d="M8.700 15a4.700 4.700 0 0 1 6.600 0M5.500 11.700a9.200 9.200 0 0 1 13 0M2.500 8.500a13.500 13.500 0 0 1 19 0" />
  </>,
);
const BLUETOOTH = glyph(<path d="M7 7.500l10 9-5 4.500v-18l5 4.500-10 9" />);
const SUN = glyph(
  <>
    <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600l1.400 1.400M17 17l1.400 1.400M5.600 18.400l1.400-1.400M17 7l1.400-1.400" />
  </>,
);
const PLANE = glyph(<path d="M21 3.500 3 11l6.500 2.500M21 3.500 14 21l-4.500-7.500M21 3.500 9.500 13.500" />);
const MOON = glyph(<path d="M20 14.500A8.500 8.500 0 1 1 9.500 4a7 7 0 0 0 10.500 10.500Z" />);
const NIGHT = glyph(
  <>
    <path d="M4 18h16M7 14a5 5 0 0 1 10 0" />
    <path d="M12 4v2M5 7.500l1.300 1.300M19 7.500l-1.300 1.300" />
  </>,
);
const LEAF = glyph(<path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15M5 19l7-7" />);
const CHEVRON = (
  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.800" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4.500 2.500 8 6l-3.500 3.500" />
  </svg>
);

interface PillProps {
  label: string;
  on: boolean;
  icon: ReactNode;
  onFlip: () => void;
  more?: { label: string; onClick: () => void };
}

function Pill({ label, on, icon, onFlip, more }: PillProps) {
  return (
    <div className={on ? "qpill qpill--on" : "qpill"}>
      <button type="button" role="switch" aria-label={label} aria-checked={on} className="qpill__flip" onClick={onFlip}>
        {icon}
        <span>{label}</span>
      </button>
      {more && (
        <>
          <i className="qpill__divider" />
          <button type="button" aria-label={more.label} className="qpill__more" onClick={more.onClick}>
            {CHEVRON}
          </button>
        </>
      )}
    </div>
  );
}

const SETTINGS: { kind: ToggleKind; label: string; icon: ReactNode; page: string }[] = [
  { kind: "airplane", label: "Airplane mode", icon: PLANE, page: "network-airplanemode" },
  { kind: "dnd", label: "Do not disturb", icon: MOON, page: "quiethours" },
  { kind: "night_light", label: "Night light", icon: NIGHT, page: "nightlight" },
  { kind: "energy_saver", label: "Energy saver", icon: LEAF, page: "batterysaver" },
];

export function QuickCard() {
  const { data } = useProvider(quickProvider);
  const { data: status } = useProvider(statusProvider);
  const [flipped, setFlipped] = useState<Partial<Record<SwitchKey, boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const battery = status?.battery ?? null;

  const sendBrightness = useMemo(
    () =>
      coalesced((percent: number) => {
        invoke("brightness_set", { percent }).catch(() => {});
      }, BRIGHTNESS_EVERY_MS),
    [],
  );

  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const running = timers.current;
    return () => running.forEach(clearTimeout);
  }, []);

  const forget = (key: SwitchKey) =>
    setFlipped((held) => {
      const left = { ...held };
      delete left[key];
      return left;
    });

  const flip = (key: SwitchKey, on: boolean, command: string, args: Record<string, unknown>) => {
    setFlipped((held) => ({ ...held, [key]: on }));
    setError(null);
    invoke(command, args).then(
      () => {
        refresh(quickProvider);
        statusChanged();
        // Windows can accept a change and not make it, so what it reports wins in the end.
        const timer = setTimeout(() => {
          timers.current.delete(timer);
          forget(key);
        }, TRUST_READING_AFTER_MS);
        timers.current.add(timer);
      },
      (e) => {
        forget(key);
        setError(String(e));
      },
    );
  };
  const flipRadio = (kind: "wifi" | "bluetooth", on: boolean) => flip(kind, on, "radio_set", { kind, on });

  const wifi = data?.radios.find((r) => r.kind === "wifi");
  const bluetooth = data?.radios.find((r) => r.kind === "bluetooth");
  const wifiOn = flipped.wifi ?? wifi?.on ?? false;
  const bluetoothOn = flipped.bluetooth ?? bluetooth?.on ?? false;

  const pillFor = (setting: (typeof SETTINGS)[number]) => {
    const reading = data?.toggles?.[setting.kind];
    if (reading === undefined || reading === null) return null;
    const on = flipped[setting.kind] ?? reading;
    return <Pill key={setting.kind} label={setting.label} on={on} icon={setting.icon} onFlip={() => flip(setting.kind, !on, "toggle_set", { kind: setting.kind, on: !on })} />;
  };
  // Energy saver reads as nothing with no battery, and there's nothing to link to then either.
  const linked = SETTINGS.filter((s) => data?.toggles?.[s.kind] === null && (s.kind !== "energy_saver" || battery));

  return (
    <Card title="Quick settings" pill={battery ? `${battery.percent}%${battery.charging ? ", charging" : ""}` : undefined}>
      <div className="quick__pills">
        {wifi && <Pill label="Wi-Fi" on={wifiOn} icon={WIFI} onFlip={() => flipRadio("wifi", !wifiOn)} more={{ label: "Wi-Fi networks", onClick: () => goToPanel("wifi") }} />}
        {bluetooth && (
          <Pill label="Bluetooth" on={bluetoothOn} icon={BLUETOOTH} onFlip={() => flipRadio("bluetooth", !bluetoothOn)} more={{ label: "Bluetooth devices", onClick: () => goToPanel("bluetooth") }} />
        )}
        {SETTINGS.map(pillFor)}
      </div>
      {error && <p className="quick__error">{error}</p>}

      <div className="quick__sliders">
        {data?.brightness != null && (
          <div className="quick__slider">
            <span className="quick__glyph">{SUN}</span>
            <Slider value={data.brightness} label="Brightness" onChange={sendBrightness} />
          </div>
        )}
        <VolumeRow />
      </div>

      {(linked.length > 0 || (data && data.brightness == null)) && (
        <div className="quick__links">
          {linked.map((s) => (
            <SettingsLink key={s.kind} page={s.page} label={s.label} />
          ))}
          {data && data.brightness == null && <SettingsLink page="display" label="Display" />}
        </div>
      )}
    </Card>
  );
}

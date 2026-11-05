import { useEffect, useMemo, useState, type ReactNode } from "react";
import { coalesced } from "../../core/coalesced";
import { refresh } from "../../core/provider";
import { invoke } from "../../core/tauri";
import { useProvider } from "../../core/useProvider";
import { Card } from "../../design/parts/Card";
import { SettingsLink } from "../../design/parts/SettingsLink";
import { Slider } from "../../design/parts/Slider";
import { quickProvider, type RadioInfo } from "../../widgets/_providers/quick";
import { statusProvider } from "../../widgets/_providers/status";
import { goToPanel, statusChanged } from "../index";
import { VolumeRow } from "../sound/VolumeRow";
import "./quick.css";

const BRIGHTNESS_EVERY_MS = 150;

const WIFI = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="18.500" r="1.800" fill="currentColor" stroke="none" />
    <path d="M8.700 15a4.700 4.700 0 0 1 6.600 0M5.500 11.700a9.200 9.200 0 0 1 13 0M2.500 8.500a13.500 13.500 0 0 1 19 0" />
  </svg>
);

const BLUETOOTH = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 7.500l10 9-5 4.500v-18l5 4.500-10 9" />
  </svg>
);

const SUN = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600l1.400 1.400M17 17l1.400 1.400M5.600 18.400l1.400-1.400M17 7l1.400-1.400" />
  </svg>
);

const CHEVRON = (
  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.800" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4.500 2.500 8 6l-3.500 3.500" />
  </svg>
);

interface PillProps {
  label: string;
  on: boolean;
  glyph: ReactNode;
  moreLabel: string;
  onFlip: () => void;
  onMore: () => void;
}

function Pill({ label, on, glyph, moreLabel, onFlip, onMore }: PillProps) {
  return (
    <div className={on ? "qpill qpill--on" : "qpill"}>
      <button type="button" role="switch" aria-label={label} aria-checked={on} className="qpill__flip" onClick={onFlip}>
        {glyph}
        <span>{label}</span>
      </button>
      <i className="qpill__divider" />
      <button type="button" aria-label={moreLabel} className="qpill__more" onClick={onMore}>
        {CHEVRON}
      </button>
    </div>
  );
}

export function QuickCard() {
  const { data } = useProvider(quickProvider);
  const { data: status } = useProvider(statusProvider);
  const [flipped, setFlipped] = useState<Partial<Record<RadioInfo["kind"], boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const battery = status?.battery ?? null;

  const sendBrightness = useMemo(
    () =>
      coalesced((percent: number) => {
        invoke("brightness_set", { percent }).catch(() => {});
      }, BRIGHTNESS_EVERY_MS),
    [],
  );

  // A reading that agrees ends the optimistic state.
  useEffect(() => {
    setFlipped((held) => {
      const left = { ...held };
      for (const radio of data?.radios ?? []) if (left[radio.kind] === radio.on) delete left[radio.kind];
      return Object.keys(left).length === Object.keys(held).length ? held : left;
    });
  }, [data]);

  const flip = (kind: RadioInfo["kind"], on: boolean) => {
    setFlipped((held) => ({ ...held, [kind]: on }));
    setError(null);
    invoke("radio_set", { kind, on }).then(
      () => {
        refresh(quickProvider);
        statusChanged();
      },
      (e) => {
        setFlipped((held) => {
          const left = { ...held };
          delete left[kind];
          return left;
        });
        setError(String(e));
      },
    );
  };

  const radio = (kind: RadioInfo["kind"]) => data?.radios.find((r) => r.kind === kind);
  const isOn = (found: RadioInfo) => flipped[found.kind] ?? found.on;
  const wifi = radio("wifi");
  const bluetooth = radio("bluetooth");

  return (
    <Card title="Quick settings">
      {(wifi || bluetooth) && (
        <div className="quick__pills">
          {wifi && <Pill label="Wi-Fi" on={isOn(wifi)} glyph={WIFI} moreLabel="Wi-Fi networks" onFlip={() => flip("wifi", !isOn(wifi))} onMore={() => goToPanel("wifi")} />}
          {bluetooth && (
            <Pill
              label="Bluetooth"
              on={isOn(bluetooth)}
              glyph={BLUETOOTH}
              moreLabel="Bluetooth settings"
              onFlip={() => flip("bluetooth", !isOn(bluetooth))}
              onMore={() => invoke("open_settings", { page: "bluetooth" }).catch(() => {})}
            />
          )}
        </div>
      )}
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

      {battery && (
        <div className="quick__battery">
          <span>{battery.charging ? "Battery, charging" : "Battery"}</span>
          <strong>{battery.percent}%</strong>
        </div>
      )}

      <div className="quick__links">
        <SettingsLink page="network-airplanemode" label="Airplane mode" />
        <SettingsLink page="quiethours" label="Do not disturb" />
        <SettingsLink page="nightlight" label="Night light" />
        {battery && <SettingsLink page="batterysaver" label="Energy saver" />}
        {data && data.brightness == null && <SettingsLink page="display" label="Display" />}
      </div>
    </Card>
  );
}

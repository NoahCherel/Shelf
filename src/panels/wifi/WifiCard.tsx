import { useEffect, useRef, useState } from "react";
import { refresh } from "../../core/provider";
import { invoke } from "../../core/tauri";
import { useProvider } from "../../core/useProvider";
import { Card } from "../../design/parts/Card";
import { SettingsLink } from "../../design/parts/SettingsLink";
import { signalBars, statusProvider } from "../../widgets/_providers/status";
import { wifiProvider, type WifiNetwork } from "../../widgets/_providers/wifi";
import { statusChanged } from "../open";
import "./wifi.css";

const SCAN_EVERY_MS = 10_000;
const SETTINGS_PAGE = "network-wifi";

const needsSettings = (n: WifiNetwork) => !n.saved && (n.auth === "enterprise" || n.auth === "other");
const needsPassword = (n: WifiNetwork) => !n.saved && (n.auth === "wpa2" || n.auth === "wpa3");

function Signal({ signal, locked }: { signal: number; locked: boolean }) {
  const bars = signalBars(signal);
  const wave = (d: string, on: boolean) => <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity={on ? 1 : 0.28} />;
  return (
    <span className="wifi__signal">
      <svg viewBox="0 0 24 24" data-bars={bars} aria-hidden="true">
        <circle cx="12" cy="18.500" r="1.800" fill="currentColor" />
        {wave("M8.700 15a4.700 4.700 0 0 1 6.600 0", bars >= 2)}
        {wave("M5.500 11.700a9.200 9.200 0 0 1 13 0", bars >= 3)}
        {wave("M2.500 8.500a13.500 13.500 0 0 1 19 0", bars >= 4)}
      </svg>
      {locked && (
        <svg className="wifi__lock" viewBox="0 0 12 12" data-locked aria-hidden="true">
          <rect x="2" y="5.500" width="8" height="5.500" rx="1.200" fill="currentColor" />
          <path d="M4 5.500V4a2 2 0 0 1 4 0v1.500" fill="none" stroke="currentColor" strokeWidth="1.300" />
        </svg>
      )}
    </span>
  );
}

function PasswordBox({ name, onSubmit }: { name: string; onSubmit: (password: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="wifi__password">
      <input
        type="password"
        aria-label={`Password for ${name}`}
        placeholder="Password"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value) onSubmit(value);
        }}
      />
      <button type="button" className="wifi__connect" disabled={!value} onClick={() => onSubmit(value)}>
        Connect
      </button>
    </div>
  );
}

function Disconnect() {
  const [armed, setArmed] = useState(false);
  const click = () => {
    if (!armed) return setArmed(true);
    setArmed(false);
    invoke("wifi_disconnect").then(() => refresh(wifiProvider), () => {});
  };
  return (
    <button type="button" className={armed ? "wifi__disconnect wifi__disconnect--armed" : "wifi__disconnect"} onClick={click} onMouseLeave={() => setArmed(false)}>
      {armed ? "Really disconnect?" : "Disconnect"}
    </button>
  );
}

/** While a password is being typed the rows stay put, however the signal changes. */
function useSteadyOrder(networks: WifiNetwork[], holding: boolean): WifiNetwork[] {
  const order = useRef<WifiNetwork[] | null>(null);
  if (!holding) {
    order.current = null;
    return networks;
  }
  const before = order.current ?? networks;
  const latest = new Map(networks.map((n) => [n.id, n]));
  order.current = [...before.map((n) => latest.get(n.id) ?? n), ...networks.filter((n) => !before.some((b) => b.id === n.id))];
  return order.current;
}

export function WifiCard() {
  const { data } = useProvider(wifiProvider);
  const { data: status } = useProvider(statusProvider);
  const [typing, setTyping] = useState<string | null>(null);
  const [refused, setRefused] = useState<{ id: string; text: string } | null>(null);
  const attempt = data?.attempt ?? null;
  const connecting = attempt?.state === "connecting";
  const networks = data?.networks ?? [];
  const rows = useSteadyOrder(networks, typing !== null);

  useEffect(() => {
    const scan = () => {
      invoke("wifi_scan").catch(() => {});
    };
    scan();
    const timer = setInterval(scan, SCAN_EVERY_MS);
    return () => clearInterval(timer);
  }, []);

  // A wrong password opens the box again, once per failure.
  const shownFailure = useRef<string | null>(null);
  useEffect(() => {
    if (attempt?.state !== "failed") return;
    const failure = `${attempt.id}:${attempt.error}`;
    if (shownFailure.current === failure) return;
    shownFailure.current = failure;
    const network = data?.networks.find((n) => n.id === attempt.id);
    if (network && needsPassword(network)) setTyping(attempt.id);
  }, [attempt, data]);

  const connectedId = data ? (data.networks.find((n) => n.connected)?.id ?? null) : undefined;
  const lastConnected = useRef(connectedId);
  useEffect(() => {
    if (connectedId === undefined) return;
    if (lastConnected.current !== undefined && lastConnected.current !== connectedId) statusChanged();
    lastConnected.current = connectedId;
  }, [connectedId]);

  const connect = (id: string, password: string | null) => {
    setRefused(null);
    invoke("wifi_connect", { id, password }).then(
      () => {
        setTyping(null);
        shownFailure.current = null;
        refresh(wifiProvider);
      },
      (e) => setRefused({ id, text: String(e) }),
    );
  };

  const choose = (network: WifiNetwork) => {
    if (needsSettings(network)) invoke("open_settings", { page: SETTINGS_PAGE }).catch(() => {});
    else if (needsPassword(network)) setTyping(typing === network.id ? null : network.id);
    else connect(network.id, null);
  };

  const footer = <SettingsLink page={SETTINGS_PAGE} label="Wi-Fi settings" />;

  if (data && !data.adapter) {
    return (
      <Card title="Wi-Fi" footer={footer}>
        <p className="wifi__note">This PC has no Wi-Fi adapter.</p>
      </Card>
    );
  }
  if (data && !data.on) {
    return (
      <Card title="Wi-Fi" footer={footer}>
        <p className="wifi__note">Wi-Fi is off. Turn it on in Settings, or with your PC's Wi-Fi key.</p>
      </Card>
    );
  }
  if (data && !data.permission) {
    return (
      <Card title="Wi-Fi" footer={<SettingsLink page="privacy-location" label="Location settings" />}>
        <p className="wifi__note">Windows only lists Wi-Fi networks for apps allowed to use your location.</p>
      </Card>
    );
  }

  return (
    <Card title="Wi-Fi" footer={footer}>
      {rows.length === 0 && <p className="wifi__note">Looking for networks…</p>}
      {rows.length > 0 && (
        <div className="wifi__list">
          {rows.map((network) => {
            const mine = attempt?.id === network.id ? attempt : null;
            const error = refused?.id === network.id ? refused.text : mine?.error;
            let detail = "";
            if (mine?.state === "connecting") detail = "Connecting…";
            else if (network.connected) detail = status?.online === false ? "Connected, no internet" : "Connected";
            else if (network.saved) detail = "Saved";
            else if (needsSettings(network)) detail = "Set up in Settings";
            else if (network.auth === "open") detail = "Open";
            const body = (
              <>
                <Signal signal={network.signal} locked={network.auth !== "open"} />
                <span className="wifi__text">
                  <span className="wifi__name">{network.name}</span>
                  {detail && <span className="wifi__detail">{detail}</span>}
                </span>
              </>
            );
            return (
              <div key={network.id} className={network.connected ? "wifi__row wifi__row--on" : "wifi__row"}>
                <div className="wifi__top">
                  {network.connected ? (
                    <div className="wifi__main">{body}</div>
                  ) : (
                    <button type="button" className="wifi__main" aria-label={network.name} disabled={connecting} onClick={() => choose(network)}>
                      {body}
                    </button>
                  )}
                  {network.connected && <Disconnect />}
                </div>
                {typing === network.id && <PasswordBox name={network.name} onSubmit={(password) => connect(network.id, password)} />}
                {error && <p className="wifi__error">{error}</p>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

import { useEffect, useState } from "react";
import { refresh } from "../../core/provider";
import { invoke } from "../../core/tauri";
import { useProvider } from "../../core/useProvider";
import { Card } from "../../design/parts/Card";
import { SettingsLink } from "../../design/parts/SettingsLink";
import { Switch } from "../../design/parts/Switch";
import { bluetoothProvider } from "../../widgets/_providers/bluetooth";
import "./bluetooth.css";

const SETTINGS_PAGE = "bluetooth";

export function BluetoothCard() {
  const { data } = useProvider(bluetoothProvider);
  const [flipped, setFlipped] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const on = flipped ?? data?.on ?? false;

  // A reading that agrees ends the optimistic state.
  useEffect(() => {
    if (flipped !== null && data?.on === flipped) setFlipped(null);
  }, [data, flipped]);

  const flip = () => {
    const next = !on;
    setFlipped(next);
    setError(null);
    invoke("radio_set", { kind: "bluetooth", on: next }).then(
      () => refresh(bluetoothProvider),
      (e) => {
        setFlipped(null);
        setError(String(e));
      },
    );
  };

  const footer = <SettingsLink page={SETTINGS_PAGE} label="Add or connect a device" />;

  if (data && data.on === null) {
    return (
      <Card title="Bluetooth">
        <p className="bt__note">This PC has no Bluetooth.</p>
      </Card>
    );
  }

  return (
    <Card title="Bluetooth" footer={footer}>
      <div className="bt__power">
        <span>Bluetooth</span>
        <Switch label="Bluetooth" on={on} onFlip={flip} />
      </div>
      {error && <p className="bt__error">{error}</p>}
      {!on && data && <p className="bt__note">Bluetooth is off.</p>}
      {on && data?.devices.length === 0 && <p className="bt__note">No paired devices yet.</p>}
      {on && (data?.devices.length ?? 0) > 0 && (
        <div className="bt__list">
          {data!.devices.map((device) => (
            <button
              key={device.id}
              type="button"
              className="bt__row"
              aria-label={device.name}
              onClick={() => invoke("open_settings", { page: SETTINGS_PAGE }).catch(() => {})}
            >
              <span className="bt__name">{device.name}</span>
              <span className={device.connected ? "bt__state bt__state--on" : "bt__state"}>{device.connected ? "Connected" : "Paired"}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

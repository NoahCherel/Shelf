import { invoke } from "../core/tauri";
import type { Provider } from "../core/widget";
import type { RadioInfo } from "./quick";

interface BluetoothDevice {
  id: string;
  name: string;
  connected: boolean;
}

export interface BluetoothState {
  /** Null when this PC has no Bluetooth. */
  on: boolean | null;
  devices: BluetoothDevice[];
}

export const bluetoothProvider: Provider<BluetoothState> = {
  id: "bluetooth",
  intervalMs: 3000,
  cache: false,
  fetch: async () => {
    const [radios, devices] = await Promise.all([invoke<RadioInfo[]>("radios_state"), invoke<BluetoothDevice[]>("bluetooth_devices")]);
    return { on: radios.find((r) => r.kind === "bluetooth")?.on ?? null, devices };
  },
};

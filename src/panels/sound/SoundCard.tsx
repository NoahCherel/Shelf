import { useEffect, useMemo, useState } from "react";
import { coalesced } from "../../core/coalesced";
import { refresh } from "../../core/provider";
import { invoke } from "../../core/tauri";
import { useProvider } from "../../core/useProvider";
import { Card } from "../../design/parts/Card";
import { SettingsLink } from "../../design/parts/SettingsLink";
import { Slider } from "../../design/parts/Slider";
import { audioProvider, type AudioApp } from "../../providers/audio";
import { VolumeRow } from "./VolumeRow";
import "./sound.css";

function AppIcon({ app }: { app: AudioApp }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    invoke<string | null>("audio_app_icon", { exe: app.exe }).then(
      (icon) => live && setSrc(icon),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [app.exe]);
  if (src) return <img className="sound__icon" src={src} alt="" draggable={false} />;
  return <span className="sound__icon sound__icon--blank">{app.name.charAt(0).toUpperCase()}</span>;
}

function AppRow({ app }: { app: AudioApp }) {
  const send = useMemo(() => coalesced((percent: number) => invoke("audio_set_app_volume", { pid: app.pid, percent }).catch(() => {})), [app.pid]);
  return (
    <div className="sound__app">
      <AppIcon app={app} />
      <div className="sound__control">
        <span className="sound__name">{app.name}</span>
        <Slider value={app.volume} label={app.name} onChange={send} />
      </div>
    </div>
  );
}

const LINK = <SettingsLink page="sound" label="Sound settings" />;

export function SoundCard() {
  const { data } = useProvider(audioProvider);
  const [chosen, setChosen] = useState<string | null>(null);
  const [outputFailed, setOutputFailed] = useState(false);

  const choose = (id: string) => {
    setChosen(id);
    setOutputFailed(false);
    invoke("audio_set_output", { id }).then(
      () => refresh(audioProvider),
      () => {
        setChosen(null);
        setOutputFailed(true);
      },
    );
  };

  // A reading that shows the switch took effect, or any other device, ends the optimistic mark.
  const active = chosen ?? data?.devices.find((d) => d.active)?.id;
  useEffect(() => {
    if (chosen && data?.devices.find((d) => d.active)?.id === chosen) setChosen(null);
  }, [chosen, data]);

  if (data && data.devices.length === 0) {
    return (
      <Card title="Sound" footer={LINK}>
        <p className="sound__none">No sound device is connected.</p>
      </Card>
    );
  }

  return (
    <Card title="Sound" footer={LINK}>
      <VolumeRow />

      {(data?.devices.length ?? 0) > 0 && (
        <section className="sound__section">
          <h2 className="card__section">OUTPUT</h2>
          <div className="sound__outputs" role="radiogroup" aria-label="Output">
            {data!.devices.map((device) => (
              <button
                key={device.id}
                type="button"
                role="radio"
                aria-checked={device.id === active}
                className="sound__output"
                onClick={() => device.id !== active && choose(device.id)}
              >
                <span>{device.name}</span>
                {device.id === active && (
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2 6.500 4.800 9.200 10 3" fill="none" stroke="currentColor" strokeWidth="1.800" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>
          {outputFailed && <p className="sound__error">Windows wouldn't switch to that output. Try it from Sound settings.</p>}
        </section>
      )}

      {(data?.apps.length ?? 0) > 0 && (
        <section className="sound__section">
          <h2 className="card__section">APPS</h2>
          <div className="sound__apps">
            {data!.apps.map((app) => (
              <AppRow key={app.pid} app={app} />
            ))}
          </div>
        </section>
      )}
    </Card>
  );
}

import { useMemo } from "react";
import { coalesced } from "../../core/coalesced";
import { refresh } from "../../core/provider";
import { invoke } from "../../core/tauri";
import { useProvider } from "../../core/useProvider";
import { Slider } from "../../design/parts/Slider";
import { audioProvider } from "../../widgets/_providers/audio";
import { statusChanged } from "../open";
import "./sound.css";

function Speaker({ muted, level }: { muted: boolean; level: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.500 9.500v5h3.500l5 4.500v-14l-5 4.500h-3.500Z" fill="currentColor" />
      {muted ? (
        <path d="M15.500 9.500l5 5m0-5l-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M15 9.500a4 4 0 0 1 0 5" opacity={level > 0 ? 1 : 0.3} />
          <path d="M17.500 7a7.500 7.500 0 0 1 0 10" opacity={level >= 50 ? 1 : 0.3} />
        </g>
      )}
    </svg>
  );
}

/** The speaker's mute button and volume, as the Sound and Quick Settings cards both show them. */
export function VolumeRow() {
  const { data } = useProvider(audioProvider);
  const send = useMemo(
    () =>
      coalesced((percent: number) => {
        invoke("audio_set_volume", { percent }).then(statusChanged, () => {});
      }),
    [],
  );
  const setMuted = (muted: boolean) => {
    invoke("audio_set_mute", { muted }).then(
      () => {
        refresh(audioProvider);
        statusChanged();
      },
      () => {},
    );
  };
  return (
    <div className="sound__master">
      <button type="button" className="sound__mute" aria-label={data?.muted ? "Unmute" : "Mute"} onClick={() => setMuted(!data?.muted)}>
        <Speaker muted={data?.muted ?? false} level={data?.volume ?? 0} />
      </button>
      <Slider value={data?.volume ?? 0} label="Volume" onChange={send} />
    </div>
  );
}

import { useEffect, useRef } from "react";
import { defineWidget, type TileProps } from "../../core/widget";
import { Tile } from "../../design/parts/Tile";
import { systemProvider, type SystemData } from "../../providers/system";
import "./battery.css";

const LOW = 20;
const FRAME_MS = 125;
const WAVE = "M0 6 Q 12.5 0 25 6 T 50 6 T 75 6 T 100 6 V 12 H 0 Z";

/**
 * Left alone, the animations redraw the whole dock at the screen's rate, which was most of Shelf's
 * use of the processor while charging. The water is slow enough for this to look the same.
 */
function useSlowMotion(on: boolean) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!on || !box.current?.getAnimations) return;
    const animations = box.current.getAnimations({ subtree: true });
    animations.forEach((a) => a.pause());
    const timer = setInterval(() => {
      animations.forEach((a) => {
        a.currentTime = Number(a.currentTime ?? 0) + FRAME_MS;
      });
    }, FRAME_MS);
    return () => {
      clearInterval(timer);
      animations.forEach((a) => a.play());
    };
  }, [on]);
  return box;
}

function Water({ percent, charging }: { percent: number; charging: boolean }) {
  const box = useSlowMotion(charging);
  return (
    <div className="battery__water" ref={box} style={{ height: `${percent}%` }}>
      <svg className="battery__wave battery__wave--back" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
        <path d={WAVE} />
      </svg>
      <svg className="battery__wave" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
        <path d={WAVE} />
      </svg>
      <span className="battery__bubble" />
      <span className="battery__bubble battery__bubble--2" />
    </div>
  );
}

function BatteryTile({ data }: TileProps<SystemData>) {
  if (data && !data.battery) {
    return (
      <Tile width={1} className="battery battery--none">
        No battery
      </Tile>
    );
  }
  const percent = data?.battery?.percent ?? 0;
  const charging = data?.battery?.charging ?? false;
  const low = !charging && percent <= LOW && data !== null;
  const cls = `battery${charging ? " battery--live" : ""}${low ? " battery--low" : ""}`;
  return (
    <Tile width={1} className={cls}>
      <Water percent={percent} charging={charging} />
      <div className="battery__label">
        {charging && (
          <svg className="battery__bolt" viewBox="0 0 12 18" aria-hidden="true">
            <path d="M7.4 0 0.8 10.2h4.1L4.2 18l7-10.6H7L7.4 0Z" fill="currentColor" />
          </svg>
        )}
        <span>{data ? percent : "–"}</span>
      </div>
    </Tile>
  );
}

export default defineWidget<SystemData>({
  id: "battery",
  name: "Battery",
  description: "Battery level as a gauge that fills up, and whether it's charging.",
  category: "system",
  width: 1,
  sample: { cpu: 0, memory: 0, battery: { percent: 86, charging: true } },
  panel: "quick",
  Tile: BatteryTile,
  provider: systemProvider,
});

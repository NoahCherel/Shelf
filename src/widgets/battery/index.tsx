import { defineWidget, type TileProps } from "../../core/widget";
import { Tile } from "../../design/parts/Tile";
import { systemProvider, type SystemData } from "../_providers/system";
import "./battery.css";

const LOW = 20;
const WAVE = "M0 6 Q 12.5 0 25 6 T 50 6 T 75 6 T 100 6 V 12 H 0 Z";

function Water({ percent }: { percent: number }) {
  return (
    <div className="battery__water" style={{ height: `${percent}%` }}>
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
      <Water percent={percent} />
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
  description: "Charge level as a filling gauge, with the charging state.",
  category: "system",
  width: 1,
  sample: { cpu: 0, memory: 0, battery: { percent: 86, charging: true } },
  panel: "quick",
  Tile: BatteryTile,
  provider: systemProvider,
});

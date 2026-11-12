import { defineWidget, type TileProps } from "../../core/widget";
import { Ring } from "../../design/parts/Ring";
import { Tile } from "../../design/parts/Tile";
import { systemProvider, type SystemData } from "../../providers/system";
import "./system-stats.css";

function Gauge({ value, label }: { value: number | undefined; label: string }) {
  return (
    <Ring percent={value ?? 0} size={0.8}>
      <div className="stats__text">
        <span className="stats__value">{value ?? "–"}</span>
        <span className="stats__label">{label}</span>
      </div>
    </Ring>
  );
}

function SystemStatsTile({ data }: TileProps<SystemData>) {
  return (
    <Tile width={2.14} className="stats">
      <Gauge value={data?.cpu} label="CPU" />
      <Gauge value={data?.memory} label="RAM" />
    </Tile>
  );
}

export default defineWidget<SystemData>({
  id: "system-stats",
  name: "System Stats",
  description: "CPU and RAM as two live rings.",
  category: "system",
  width: 2.14,
  sample: { cpu: 9, memory: 69, battery: null },
  Tile: SystemStatsTile,
  provider: systemProvider,
});

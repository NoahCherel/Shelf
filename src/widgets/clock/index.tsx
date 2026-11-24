import { useSettings } from "../../core/settings";
import { defineWidget, type TileProps } from "../../core/widget";
import { Tile } from "../../design/parts/Tile";
import { clockProvider, dateParts, timeParts } from "../../providers/clock";
import { DateCard } from "../_shared/DateCard";
import "./clock.css";

function ClockTile({ data }: TileProps<number>) {
  const hour24 = useSettings((s) => s.hour24);
  const seconds = useSettings((s) => s.seconds);
  const now = data ?? Date.now();
  const parts = timeParts(now, hour24);
  const date = dateParts(now);
  return (
    <Tile width={2.24} className="clock">
      <div className="clock__line">
        <span className="clock__time">{parts.time}</span>
        {seconds && <span className="clock__seconds">:{parts.seconds}</span>}
        {parts.suffix && <span className="clock__suffix">{parts.suffix}</span>}
      </div>
      <div className="clock__date">
        {date.weekdayShort} {date.day} {date.month}
      </div>
    </Tile>
  );
}

export default defineWidget<number>({
  id: "clock",
  name: "Clock",
  description: "A big clock with seconds and today's date, 12- or 24-hour.",
  category: "clocks",
  width: 2.24,
  sample: new Date(2026, 9, 11, 17, 43, 59).getTime(),
  Tile: ClockTile,
  Card: DateCard,
  provider: clockProvider,
});

import { useSettings } from "../../core/settings";
import { defineWidget, type TileProps } from "../../core/widget";
import { Tile } from "../../design/parts/Tile";
import { dateParts, minuteProvider, timeParts } from "../../providers/clock";
import { useWeather, type Weather } from "../../providers/weather";
import { DateCard } from "../_shared/DateCard";
import "./clock-and-weather.css";

const SAMPLE_WEATHER: Weather = { city: "", temp: 22, code: 0, days: [] };

function ClockWeatherTile({ data, preview }: TileProps<number>) {
  const hour24 = useSettings((s) => s.hour24);
  const weather = useWeather(preview, SAMPLE_WEATHER);
  const now = data ?? Date.now();
  const { time, suffix } = timeParts(now, hour24);
  const date = dateParts(now);
  return (
    <Tile width={1} className="cw">
      <div className="cw__top">
        <span className="cw__time">{time}</span>
        {suffix && <span className="cw__suffix">{suffix}</span>}
      </div>
      <div className="cw__date">
        <span className="cw__weekday">{date.weekdayShort}</span>
        <span className="cw__day">{date.day}</span>
      </div>
      <div className="cw__side">
        <span className="cw__temp" data-empty={!weather}>
          {weather ? `${weather.temp}°` : "–"}
        </span>
      </div>
    </Tile>
  );
}

export default defineWidget<number>({
  id: "clock-and-weather",
  name: "Clock & Weather",
  description: "Time, date and temperature as three colour blocks in one square tile.",
  category: "clocks",
  width: 1,
  sample: new Date(2026, 9, 11, 17, 49).getTime(),
  Tile: ClockWeatherTile,
  Card: DateCard,
  provider: minuteProvider,
});

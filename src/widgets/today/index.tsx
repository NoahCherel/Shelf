import { useSettings } from "../../core/settings";
import { defineWidget, type TileProps } from "../../core/widget";
import { Tile } from "../../design/parts/Tile";
import { dateParts, minuteProvider, timeParts } from "../../providers/clock";
import { useWeather, type Weather } from "../../providers/weather";
import { DateCard } from "../_shared/DateCard";
import { WeatherGlyph } from "../_shared/WeatherGlyph";
import "./today.css";

const SAMPLE_WEATHER: Weather = { city: "", temp: 36, code: 0, days: [] };

function TodayTile({ data, preview }: TileProps<number>) {
  const hour24 = useSettings((s) => s.hour24);
  const weather = useWeather(preview, SAMPLE_WEATHER);
  const now = data ?? Date.now();
  const { time, suffix } = timeParts(now, hour24);
  const date = dateParts(now);
  return (
    <Tile width={3.09} className="today">
      <div className="today__left">
        <span className="today__weekday">{date.weekday.toUpperCase()}</span>
        <span className="today__date">
          {date.month} {date.day}
        </span>
      </div>
      <div className="today__divider" />
      <div className="today__right">
        <div className="today__clock">
          <span className="today__time">{time}</span>
          {suffix && <span className="today__suffix">{suffix}</span>}
        </div>
        {weather && (
          <div className="today__weather">
            <WeatherGlyph code={weather.code} className="today__glyph" />
            <span>{weather.temp}°</span>
          </div>
        )}
      </div>
    </Tile>
  );
}

export default defineWidget<number>({
  id: "today",
  name: "Today",
  description: "Weekday, date, time and weather in a single tile.",
  category: "clocks",
  width: 3.09,
  sample: new Date(2026, 9, 1, 17, 4).getTime(),
  Tile: TodayTile,
  Card: DateCard,
  provider: minuteProvider,
});

import { useState, type FormEvent } from "react";
import { useSettings } from "../../core/settings";
import { useProvider } from "../../core/useProvider";
import type { TileProps } from "../../core/widget";
import { Card } from "../../design/parts/Card";
import { buildMonth } from "../_providers/clock";
import { weatherProvider } from "../_providers/weather";
import { WeatherGlyph } from "./WeatherGlyph";
import "./date-card.css";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function CityField() {
  const city = useSettings((s) => s.weather.city);
  const update = useSettings((s) => s.update);
  const [value, setValue] = useState(city);
  const save = (e: FormEvent) => {
    e.preventDefault();
    update({ weather: { city: value.trim() } });
  };
  return (
    <form onSubmit={save}>
      <input
        className="date__city"
        value={value}
        placeholder="Add a city for weather"
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
      />
    </form>
  );
}

function Forecast() {
  const { data, error } = useProvider(weatherProvider);
  const city = useSettings((s) => s.weather.city.trim());
  if (!city) return null;
  if (error && !data) return <p className="date__error">{error.message}</p>;
  if (!data || data.city !== city) return null;
  return (
    <div className="date__forecast">
      {data.days.map((day) => (
        <div key={day.date} className="date__fday">
          <span className="date__fname">{new Date(`${day.date}T12:00`).toLocaleDateString("en-GB", { weekday: "short" })}</span>
          <WeatherGlyph code={day.code} className="date__glyph" />
          <span className="date__ftemp">{day.max}°</span>
          <span className="date__fmin">{day.min}°</span>
        </div>
      ))}
    </div>
  );
}

/** A simple month and forecast, for every clock. */
export function DateCard({ data }: TileProps<number>) {
  const month = buildMonth(new Date(data ?? Date.now()));
  return (
    <Card title={month.title}>
      <div className="date__grid">
        {WEEKDAYS.map((name, i) => (
          <span key={i} className="date__name">
            {name}
          </span>
        ))}
        {month.cells.map((day, i) =>
          day === null ? (
            <span key={`blank-${i}`} />
          ) : (
            <span key={day} className={day === month.today ? "date__day date__today" : "date__day"}>
              {day}
            </span>
          ),
        )}
      </div>
      <Forecast />
      <CityField />
    </Card>
  );
}

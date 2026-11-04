import { runNow } from "../../core/provider";
import { useSettings } from "../../core/settings";
import { useProvider } from "../../core/useProvider";
import type { Provider, ProviderError } from "../../core/widget";
import { ensureOk, httpGet } from "./http";

export interface WeatherDay {
  date: string;
  code: number;
  max: number;
  min: number;
}

export interface Weather {
  city: string;
  temp: number;
  code: number;
  days: WeatherDay[];
}

export type WeatherKind = "sun" | "cloud" | "rain" | "snow" | "storm";

/** WMO weather codes, as Open-Meteo reports them. */
export function weatherKind(code: number): WeatherKind {
  if (code <= 1) return "sun";
  if (code >= 95 && code <= 99) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  return "cloud";
}

interface ForecastBody {
  current: { temperature_2m: number; weather_code: number };
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
}

export function parseWeather(body: ForecastBody, city: string): Weather {
  const { daily } = body;
  return {
    city,
    temp: Math.round(body.current.temperature_2m),
    code: body.current.weather_code,
    days: daily.time.map((date, i) => ({
      date,
      code: daily.weather_code[i],
      max: Math.round(daily.temperature_2m_max[i]),
      min: Math.round(daily.temperature_2m_min[i]),
    })),
  };
}

const currentCity = () => useSettings.getState().weather.city.trim();

export const weatherProvider: Provider<Weather> = {
  id: "weather",
  intervalMs: 30 * 60_000,
  needsSetup: async () => !currentCity(),
  fetch: async () => {
    const city = currentCity();
    const geo = await httpGet({
      url: `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`,
    });
    ensureOk(geo, {});
    const place = (JSON.parse(geo.body) as { results?: { latitude: number; longitude: number }[] }).results?.[0];
    if (!place) throw { kind: "notfound", message: `Couldn't find a city called "${city}".` } satisfies ProviderError;
    const forecast = await httpGet({
      url:
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        "&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min" +
        "&timezone=auto&forecast_days=5",
    });
    ensureOk(forecast, {});
    return parseWeather(JSON.parse(forecast.body), city);
  },
};

// A new city, here or in another window, needs new weather straight away.
useSettings.subscribe((now, before) => {
  if (now.weather.city !== before.weather.city) runNow(weatherProvider);
});

/** For tiles that show weather next to the time. Null means none to show. */
export function useWeather(preview: boolean | undefined, sample: Weather): Weather | null {
  const city = useSettings((s) => s.weather.city.trim());
  const { data } = useProvider(preview ? undefined : weatherProvider, preview ? sample : undefined);
  if (preview) return sample;
  return data && data.city === city ? data : null;
}

import { vi } from "vitest";
import { buildMonth, dateParts, timeParts } from "./clock";
import { parseWeather, weatherKind } from "./weather";

const at = (h: number, m: number, s = 7) => new Date(2026, 9, 11, h, m, s).getTime();

describe("timeParts", () => {
  it("formats 12-hour with a suffix and no leading zero", () => {
    expect(timeParts(at(17, 43), false)).toEqual({ time: "5:43", seconds: "07", suffix: "PM" });
    expect(timeParts(at(0, 5), false)).toEqual({ time: "12:05", seconds: "07", suffix: "AM" });
    expect(timeParts(at(12, 0), false).suffix).toBe("PM");
  });

  it("formats 24-hour with no suffix", () => {
    expect(timeParts(at(17, 43), true)).toEqual({ time: "17:43", seconds: "07", suffix: "" });
    expect(timeParts(at(9, 3), true).time).toBe("09:03");
  });
});

it("dateParts gives English short and long names", () => {
  const d = dateParts(at(12, 0));
  expect(d.weekdayShort).toBe("Sun");
  expect(d.weekday).toBe("Sunday");
  expect(d.day).toBe(11);
  expect(d.month).toBe("Oct");
});

describe("buildMonth", () => {
  it("starts on Monday and marks today", () => {
    const m = buildMonth(new Date(2026, 9, 11));
    expect(m.title).toBe("October 2026");
    // Oct 2026 starts on a Thursday: three leading blanks.
    expect(m.cells.slice(0, 4)).toEqual([null, null, null, 1]);
    expect(m.cells.filter((c) => c !== null).length).toBe(31);
    expect(m.today).toBe(11);
  });
});

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

describe("weather", () => {
  const body = {
    current: { temperature_2m: 21.6, weather_code: 3 },
    daily: { time: ["2026-10-11", "2026-10-12"], weather_code: [3, 61], temperature_2m_max: [23.2, 19], temperature_2m_min: [11.1, 9.8] },
  };

  it("parses and rounds", () => {
    const w = parseWeather(body, "Paris");
    expect(w.city).toBe("Paris");
    expect(w.temp).toBe(22);
    expect(w.code).toBe(3);
    expect(w.days[1]).toEqual({ date: "2026-10-12", code: 61, max: 19, min: 10 });
  });

  it("maps codes to a kind", () => {
    expect(weatherKind(0)).toBe("sun");
    expect(weatherKind(3)).toBe("cloud");
    expect(weatherKind(63)).toBe("rain");
    expect(weatherKind(73)).toBe("snow");
    expect(weatherKind(95)).toBe("storm");
    expect(weatherKind(999)).toBe("cloud");
  });
});

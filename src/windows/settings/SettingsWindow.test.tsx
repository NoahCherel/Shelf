import { beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { invoke } from "../../core/tauri";
import { followLook } from "../../core/look";
import { defaults, useSettings } from "../../core/settings";
import { SettingsWindow } from "./SettingsWindow";
import { Section } from "./controls";
import { ACCENTS, section, SCHEMA, slider, toggle } from "./schema";

vi.mock("../../core/tauri", () => ({
  invoke: vi.fn(async () => null),
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
  appVersion: vi.fn(async () => "1.2.3"),
}));

const mockInvoke = vi.mocked(invoke);
const open = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const styles = () => within(screen.getByRole("radiogroup", { name: "Style" }));

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(null);
  useSettings.setState({ ...defaults() });
});

it("has the Mac-style sidebar sections", () => {
  render(<SettingsWindow />);
  for (const name of ["Appearance", "Dock", "General", "About"]) expect(screen.getByRole("button", { name })).toBeTruthy();
});

it("offers all six styles, and Clear's material only matters with Clear", () => {
  render(<SettingsWindow />);
  for (const name of ["Liquid Glass", "iOS Glass", "Midnight", "Black", "White", "Clear"]) expect(styles().getByRole("radio", { name })).toBeTruthy();
  const material = () => screen.getByRole("radio", { name: "Frosted" });
  expect(material().matches(":disabled")).toBe(true);
  fireEvent.click(styles().getByRole("radio", { name: "Clear" }));
  expect(useSettings.getState().style).toBe("clear");
  expect(material().matches(":disabled")).toBe(false);
});

it("any colour can be the accent, besides the nine", () => {
  render(<SettingsWindow />);
  fireEvent.change(screen.getByLabelText("Your own colour"), { target: { value: "#12ab34" } });
  expect(useSettings.getState().accent).toBe("#12ab34");
});

it("adding a setting needs one schema line and renders with its info tip", () => {
  const demo = section("Demo", [toggle("seconds", { label: "One line", tip: "Explained here." })]);
  render(<Section section={demo} />);
  expect(screen.getByRole("switch", { name: "One line" })).toBeTruthy();
  expect(screen.getByLabelText("Explained here.")).toBeTruthy();
});

it("every setting in the schema has an info tip", () => {
  const rows = SCHEMA.flatMap((page) => page.groups.flatMap((g) => g.rows));
  expect(rows.length).toBeGreaterThan(5);
  for (const row of rows) expect(row.tip, row.label).toBeTruthy();
});

it("size slider updates --T live", () => {
  followLook();
  render(<SettingsWindow />);
  open("Dock");
  fireEvent.change(screen.getByRole("slider", { name: "Size" }), { target: { value: "62" } });
  expect(useSettings.getState().size).toBe(62);
  expect(document.documentElement.style.getPropertyValue("--T")).toBe("62px");
});

it("S, M and L jump the slider", () => {
  render(<SettingsWindow />);
  open("Dock");
  fireEvent.click(screen.getByRole("button", { name: "L" }));
  expect(useSettings.getState().size).toBe(62);
  fireEvent.click(screen.getByRole("button", { name: "M" }));
  expect(useSettings.getState().size).toBe(50);
});

it("the slider runs from 40 to 62", () => {
  const rows = SCHEMA.flatMap((page) => page.groups.flatMap((g) => g.rows));
  const size = rows.find((r) => r.label === "Size");
  expect(size).toMatchObject({ kind: "slider", min: 40, max: 62 });
  expect(slider).toBeTruthy();
});

it("there are nine accents, and choosing one applies", () => {
  expect(ACCENTS.length).toBe(9);
  render(<SettingsWindow />);
  fireEvent.click(screen.getByRole("radio", { name: "Purple" }));
  expect(useSettings.getState().accent).toBe(ACCENTS.find((a) => a.name === "Purple")!.color);
});

it("choosing a style applies", () => {
  render(<SettingsWindow />);
  fireEvent.click(styles().getByRole("radio", { name: "Black" }));
  expect(useSettings.getState().style).toBe("black");
});

it("changing the taskbar mode tells Rust", () => {
  render(<SettingsWindow />);
  open("General");
  fireEvent.click(screen.getByRole("radio", { name: "Auto-hide" }));
  expect(useSettings.getState().taskbarMode).toBe("autohide");
  expect(mockInvoke).toHaveBeenCalledWith("set_taskbar_mode", { mode: "autohide" });
});

it("Launch at startup state is read from Windows, not assumed", async () => {
  mockInvoke.mockImplementation(async (cmd) => (cmd === "autostart_get" ? true : null));
  render(<SettingsWindow />);
  open("General");
  const toggleEl = screen.getByRole("switch", { name: "Launch at startup" });
  await waitFor(() => expect(toggleEl.getAttribute("aria-checked")).toBe("true"));
});

it("switching Launch at startup writes to Windows", async () => {
  mockInvoke.mockImplementation(async (cmd) => (cmd === "autostart_set" ? true : false));
  render(<SettingsWindow />);
  open("General");
  fireEvent.click(screen.getByRole("switch", { name: "Launch at startup" }));
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("autostart_set", { on: true }));
});

it("Quit is reachable", () => {
  render(<SettingsWindow />);
  open("General");
  fireEvent.click(screen.getByRole("button", { name: "Quit Shelf" }));
  expect(mockInvoke).toHaveBeenCalledWith("quit");
});

it("text settings save nested values", () => {
  render(<SettingsWindow />);
  open("General");
  const city = screen.getByRole("textbox", { name: "Weather city" });
  fireEvent.change(city, { target: { value: "Paris" } });
  fireEvent.blur(city);
  expect(useSettings.getState().weather.city).toBe("Paris");
});

it("About shows the version", async () => {
  render(<SettingsWindow />);
  open("About");
  await screen.findByText("1.2.3");
});

it("closes through Rust", () => {
  render(<SettingsWindow />);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(mockInvoke).toHaveBeenCalledWith("close_window", { kind: "settings" });
});

it("with auto-hide on, floating over windows can't be changed, as nothing is reserved anyway", () => {
  render(<SettingsWindow />);
  open("Dock");
  const float = () => screen.getByRole("switch", { name: "Float over windows" }) as HTMLButtonElement;
  expect(float().matches(":disabled")).toBe(false);
  fireEvent.click(screen.getByRole("switch", { name: "Auto-hide" }));
  expect(useSettings.getState().autoHide).toBe(true);
  expect(float().matches(":disabled")).toBe(true);
  expect(screen.getByRole("switch", { name: "Stay up on the desktop" })).toBeTruthy();
});

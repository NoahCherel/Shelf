import { beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { invoke } from "../../core/tauri";
import { setDockIds } from "../../core/dockIds";
import widget from "./index";
import type { StatusData } from "../_providers/status";
import { signalBars } from "../_providers/status";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockInvoke = vi.mocked(invoke);
const T = widget.Tile;
const DATA: StatusData = {
  wifi: { ssid: "Livebox", signal: 80 },
  online: true,
  volume: { percent: 40, muted: false },
  battery: { percent: 60, charging: false },
};

beforeEach(() => {
  mockInvoke.mockClear();
});

const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("the bell", () => {
  it("shows how many notifications are waiting", () => {
    render(<T data={{ ...DATA, notifications: 3 }} status="ready" />);
    expect(screen.getByRole("button", { name: "Notifications" }).querySelector(".status__count")?.textContent).toBe("3");
  });

  it("shows no count with none waiting", () => {
    render(<T data={{ ...DATA, notifications: 0 }} status="ready" />);
    expect(screen.getByRole("button", { name: "Notifications" }).querySelector(".status__count")).toBeNull();
  });

  it("a large count stays short", () => {
    render(<T data={{ ...DATA, notifications: 42 }} status="ready" />);
    expect(screen.getByRole("button", { name: "Notifications" }).querySelector(".status__count")?.textContent).toBe("9+");
  });
});

describe("opens its own card", () => {
  it("the Wi-Fi icon opens Shelf's own card", () => {
    render(<T data={DATA} status="ready" />);
    press("Network");
    expect(mockInvoke).toHaveBeenCalledWith("open_card", expect.objectContaining({ widgetId: "__panel:wifi" }));
    expect(mockInvoke).not.toHaveBeenCalledWith("shell_panel", expect.anything());
  });

  it("the sound icon opens Shelf's own card", () => {
    render(<T data={DATA} status="ready" />);
    press("Sound");
    expect(mockInvoke).toHaveBeenCalledWith("open_card", expect.objectContaining({ widgetId: "__panel:sound" }));
    expect(mockInvoke).not.toHaveBeenCalledWith("shell_panel", expect.anything());
  });

  it("the battery icon opens Shelf's own card", () => {
    render(<T data={DATA} status="ready" />);
    press("Battery");
    expect(mockInvoke).toHaveBeenCalledWith("open_card", expect.objectContaining({ widgetId: "__panel:quick" }));
  });

  it("the bell opens notifications", () => {
    render(<T data={DATA} status="ready" />);
    press("Notifications");
    expect(mockInvoke).toHaveBeenCalledWith("open_card", expect.objectContaining({ widgetId: "__panel:notifications" }));
    expect(mockInvoke).not.toHaveBeenCalledWith("shell_panel", expect.anything());
  });

  it("does nothing in the picker", () => {
    render(<T data={DATA} status="sample" preview />);
    press("Network");
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe("shows the real state", () => {
  const net = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-net]")?.dataset.net;

  it("Wi-Fi shows its bars and network name", () => {
    const { container } = render(<T data={DATA} status="ready" />);
    expect(net(container)).toBe("wifi-4");
    expect(screen.getByRole("button", { name: "Network" }).getAttribute("title")).toContain("Livebox");
  });

  it("online with no Wi-Fi means a cable", () => {
    const { container } = render(<T data={{ ...DATA, wifi: null }} status="ready" />);
    expect(net(container)).toBe("wired");
  });

  it("no connection at all says so", () => {
    const { container } = render(<T data={{ ...DATA, wifi: null, online: false }} status="ready" />);
    expect(net(container)).toBe("offline");
  });

  it("a muted speaker is marked", () => {
    const { container } = render(<T data={{ ...DATA, volume: { percent: 40, muted: true } }} status="ready" />);
    expect(container.querySelector("[data-muted='true']")).toBeTruthy();
  });

  it("with the battery widget on the dock, the battery icon gives way to quick settings", () => {
    setDockIds(["system-status", "battery"]);
    render(<T data={DATA} status="ready" />);
    expect(screen.queryByRole("button", { name: "Battery" })).toBeNull();
    press("Quick settings");
    expect(mockInvoke).toHaveBeenCalledWith("open_card", expect.objectContaining({ widgetId: "__panel:quick" }));
    setDockIds([]);
  });

  it("a machine with no battery has no battery icon", () => {
    render(<T data={{ ...DATA, battery: null }} status="ready" />);
    expect(screen.queryByRole("button", { name: "Battery" })).toBeNull();
    press("Quick settings");
    expect(mockInvoke).toHaveBeenCalledWith("open_card", expect.objectContaining({ widgetId: "__panel:quick" }));
  });

  it("draws before the first reading", () => {
    render(<T data={null} status="loading" />);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
  });

  it("signal maps to bars", () => {
    expect(signalBars(0)).toBe(1);
    expect(signalBars(30)).toBe(2);
    expect(signalBars(60)).toBe(3);
    expect(signalBars(100)).toBe(4);
  });
});

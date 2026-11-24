import { beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import chatgpt from "./index";
import { chatgptProvider, type ChatGptData } from "../../providers/chatgpt";
import { invoke } from "../../core/tauri";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockInvoke = vi.mocked(invoke);
const inMs = (ms: number) => Date.now() + ms;
const DATA: ChatGptData = {
  plan: "Pro",
  session: { percent: 25, resetsAt: inMs(190 * 60_000) },
  weekly: { percent: 76, resetsAt: inMs(4 * 86_400_000) },
  history: [8, 14, 25],
  updatedMs: 1,
};

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("ChatGPT Usage widget", () => {
  const T = chatgpt.Tile;
  const C = chatgpt.Card!;

  it("renders logo, Session, Weekly and percents on the tile", () => {
    const { container } = render(<T data={DATA} status="ready" />);
    expect(container.querySelector(".chatgpt-logo")).toBeTruthy();
    expect(screen.getByText("Session")).toBeTruthy();
    expect(screen.getByText("Weekly")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
    expect(screen.getByText("76%")).toBeTruthy();
    expect(chatgpt.width).toBe(4.58);
  });

  it("shows Check again when not connected", () => {
    render(<C data={null} status="sample" />);
    expect(screen.getByText(/Codex CLI/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
  });

  it("shows plan pill, level bars and trend chart on the card", () => {
    const { container } = render(<C data={DATA} status="ready" />);
    expect(screen.getByText("Pro")).toBeTruthy();
    expect(screen.getByText("TREND")).toBeTruthy();
    const levels = [...container.querySelectorAll("[data-level]")].map((b) => b.getAttribute("data-level"));
    expect(levels).toEqual(["good", "warn"]);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  });

  it("provider maps primary and secondary windows", async () => {
    const future = Date.now() / 1000 + 600;
    mockInvoke.mockResolvedValue({
      connected: true,
      plan: "plus",
      usage: {
        primary: { used_percentage: 33, resets_at: future },
        secondary: { used_percentage: 12, resets_at: future + 3600 },
      },
      history: [10, 33],
    });
    expect(await chatgptProvider.needsSetup!()).toBe(false);
    const out = await chatgptProvider.fetch(null);
    expect(out.plan).toBe("Plus");
    expect(out.session?.percent).toBe(33);
    expect(out.weekly?.percent).toBe(12);
    expect(out.history).toEqual([10, 33]);
  });
});

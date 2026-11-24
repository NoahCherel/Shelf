import { beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import gemini from "./index";
import { geminiProvider, type GeminiData } from "../../providers/gemini";
import { invoke } from "../../core/tauri";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockInvoke = vi.mocked(invoke);
const inMs = (ms: number) => Date.now() + ms;
const DATA: GeminiData = {
  plan: "Antigravity",
  session: { percent: 24, resetsAt: inMs(4 * 3_600_000) },
  weekly: { percent: 91, resetsAt: inMs(5 * 86_400_000) },
  groups: [
    {
      name: "Gemini Models",
      session: { percent: 24, resetsAt: inMs(4 * 3_600_000) },
      weekly: { percent: 91, resetsAt: inMs(5 * 86_400_000) },
    },
    {
      name: "Claude and GPT models",
      session: { percent: 12, resetsAt: inMs(4 * 3_600_000) },
      weekly: { percent: 5, resetsAt: inMs(5 * 86_400_000) },
    },
  ],
  history: [8, 16, 24],
  updatedMs: 1,
};

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("Gemini (Antigravity) widget", () => {
  const T = gemini.Tile;
  const C = gemini.Card!;

  it("renders logo, Session, Weekly and percents on the tile", () => {
    const { container } = render(<T data={DATA} status="ready" />);
    expect(container.querySelector(".gemini-logo")).toBeTruthy();
    expect(screen.getByText("Session")).toBeTruthy();
    expect(screen.getByText("Weekly")).toBeTruthy();
    expect(screen.getByText("24%")).toBeTruthy();
    expect(screen.getByText("91%")).toBeTruthy();
    expect(gemini.width).toBe(4.58);
  });

  it("shows Check again when not connected", () => {
    render(<C data={null} status="sample" />);
    expect(screen.getByText(/agy CLI/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
  });

  it("shows Gemini and extra model pools, levels and trend chart on the card", () => {
    const { container } = render(<C data={DATA} status="ready" />);
    expect(screen.getByText("Antigravity")).toBeTruthy();
    expect(screen.getByText("GEMINI MODELS")).toBeTruthy();
    expect(screen.getByText("CLAUDE AND GPT MODELS")).toBeTruthy();
    const levels = [...container.querySelectorAll("[data-level]")].map((b) => b.getAttribute("data-level"));
    expect(levels).toEqual(["good", "full", "good", "good"]);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  });

  it("provider maps session, weekly, groups and history", async () => {
    const future = Date.now() / 1000 + 3600;
    mockInvoke.mockResolvedValue({
      connected: true,
      plan: "Antigravity",
      usage: {
        session: { used_percentage: 24, resets_at: future },
        weekly: { used_percentage: 6, resets_at: future + 86_400 },
        groups: [
          {
            name: "Gemini Models",
            session: { used_percentage: 24, resets_at: future },
            weekly: { used_percentage: 6, resets_at: future + 86_400 },
          },
        ],
      },
      history: [6, 24],
    });
    expect(await geminiProvider.needsSetup!()).toBe(false);
    const out = await geminiProvider.fetch(null);
    expect(out.plan).toBe("Antigravity");
    expect(out.session?.percent).toBe(24);
    expect(out.weekly?.percent).toBe(6);
    expect(out.groups).toHaveLength(1);
    expect(out.history).toEqual([6, 24]);
  });
});

import { beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import glm from "./index";
import { fetchGlm, GLM_SAMPLE, normalizeResetMs, parseGlmLimits } from "../../providers/glm";
import { invoke } from "../../core/tauri";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("GLM Usage provider", () => {
  it("normalizes millisecond and second timestamps correctly", () => {
    expect(normalizeResetMs(1_800_000_000_000)).toBe(1_800_000_000_000);
    expect(normalizeResetMs(1_800_000_000)).toBe(1_800_000_000_000);
    expect(normalizeResetMs(0)).toBeNull();
  });

  it("parses TOKENS_LIMIT (session + weekly) and TIME_LIMIT (MCP)", () => {
    const now = 1_760_000_000_000;
    const out = parseGlmLimits(
      [
        { type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 25, nextResetTime: now + 3_600_000 },
        { type: "TOKENS_LIMIT", unit: 6, number: 1, percentage: 12, nextResetTime: now + 86_400_000 },
        {
          type: "TIME_LIMIT",
          unit: 5,
          number: 1,
          usage: 100,
          currentValue: 15,
          percentage: 15,
          usageDetails: [{ modelCode: "search-prime", usage: 10 }],
        },
      ],
      now,
    );
    expect(out.session?.percent).toBe(25);
    expect(out.session?.resetsAt).toBe(now + 3_600_000);
    expect(out.weekly?.percent).toBe(12);
    expect(out.mcp?.percent).toBe(15);
    expect(out.mcpDetails).toEqual([{ name: "search-prime", usage: 10 }]);
  });

  it("auto-detects BigModel when Z.ai rejects the key", async () => {
    const future = Date.now() + 3_600_000;
    mockInvoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "store_load") return null;
      if (cmd === "http_get") {
        const url = (args?.req as { url: string }).url;
        if (url.includes("api.z.ai")) return { status: 401, body: "{}" };
        return {
          status: 200,
          body: JSON.stringify({
            code: 200,
            success: true,
            data: { limits: [{ type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 33, nextResetTime: future }] },
          }),
        };
      }
      return null;
    });

    const data = await fetchGlm();
    expect(data.region).toBe("bigmodel");
    expect(data.session?.percent).toBe(33);
  });
});

describe("GLM Usage widget", () => {
  const T = glm.Tile;
  const C = glm.Card!;

  it("renders logo and Session, Weekly, MCP rows on the tile", () => {
    const { container } = render(<T data={GLM_SAMPLE} status="ready" />);
    expect(container.querySelector(".glm-logo")).toBeTruthy();
    expect(screen.getByText("Session")).toBeTruthy();
    expect(screen.getByText("Weekly")).toBeTruthy();
    expect(screen.getByText("MCP")).toBeTruthy();
    expect(screen.getByText("28%")).toBeTruthy();
    expect(glm.width).toBe(4.58);
  });

  it("shows ConnectCard when sample and clears store on Disconnect", async () => {
    const { rerender } = render(<C data={null} status="sample" />);
    expect(screen.getByPlaceholderText("API key…")).toBeTruthy();

    rerender(<C data={GLM_SAMPLE} status="ready" />);
    expect(screen.getByText("Z.ai")).toBeTruthy();
    expect(screen.getByText("MCP TOOLS")).toBeTruthy();
    expect(screen.getByText("search-prime")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    });
    expect(mockInvoke).toHaveBeenCalledWith("secret_delete", { id: "glm" });
    expect(mockInvoke).toHaveBeenCalledWith("store_save", {
      name: "glm-history",
      value: { region: null, history: [], lastResetAt: null },
    });
  });
});

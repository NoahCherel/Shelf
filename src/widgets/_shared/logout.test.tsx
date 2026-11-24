import { beforeEach, vi } from "vitest";
import { invoke } from "../../core/tauri";
import { defaults, useSettings } from "../../core/settings";
import stripe from "../stripe/index";
import chart from "../stripe-chart/index";
import github from "../github-activity/index";
import claude from "../claude-usage/index";
import plan from "../claude-plan-usage/index";
import deepseek from "../deepseek-balance/index";
import glm from "../glm-usage/index";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockInvoke = vi.mocked(invoke);
const ctx = { refresh: () => {} };
const logout = (def: { menu?: typeof stripe.menu }) => def.menu!(ctx).find((i) => i.label === "Logout")!;

beforeEach(() => {
  mockInvoke.mockClear();
  useSettings.setState({ ...defaults(), github: { user: "octocat" } });
});

it("Stripe tiles log out by forgetting the key", () => {
  for (const def of [stripe, chart]) {
    mockInvoke.mockClear();
    logout(def).onClick();
    expect(mockInvoke).toHaveBeenCalledWith("secret_delete", { id: "stripe" });
  }
});

it("GitHub logs out by forgetting the user", () => {
  logout(github).onClick();
  expect(useSettings.getState().github.user).toBe("");
});

it("Claude tiles log out by disconnecting the status line", () => {
  for (const def of [claude, plan]) {
    mockInvoke.mockClear();
    logout(def).onClick();
    expect(mockInvoke).toHaveBeenCalledWith("claude_connect", { on: false });
  }
});

it("DeepSeek and GLM log out by forgetting their keys", () => {
  logout(deepseek).onClick();
  expect(mockInvoke).toHaveBeenCalledWith("secret_delete", { id: "deepseek" });
  mockInvoke.mockClear();
  logout(glm).onClick();
  expect(mockInvoke).toHaveBeenCalledWith("secret_delete", { id: "glm" });
});

import { beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import stripe from "./index";
import chart from "../stripe-chart/index";
import github from "../github-activity/index";
import { invoke } from "../../core/tauri";
import { defaults, useSettings } from "../../core/settings";
import type { StripeData } from "../_providers/stripe";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));

const mockInvoke = vi.mocked(invoke);

const DATA: StripeData = {
  currency: "USD",
  today: 120,
  week: 2980,
  month30: 5336,
  daily: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  change: 31,
  testMode: false,
  payments: { today: 2, week: 11, month30: 40 },
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(null);
  useSettings.setState({ ...defaults() });
});

describe("Stripe tile", () => {
  it("shows the 30-day amount and label", () => {
    render(<stripe.Tile data={DATA} status="ready" />);
    expect(screen.getByText("$5,336")).toBeTruthy();
    expect(screen.getByText("net revenue · 30 days")).toBeTruthy();
  });
});

describe("Stripe Chart tile", () => {
  it("shows the week, its change and a line", () => {
    const { container } = render(<chart.Tile data={DATA} status="ready" />);
    expect(screen.getByText("Net revenue")).toBeTruthy();
    expect(screen.getByText("$2,980")).toBeTruthy();
    expect(screen.getByText("▲ 31%")).toBeTruthy();
    expect(container.querySelectorAll(".sc__line path").length).toBe(2);
  });

  it("a drop points down, and in red", () => {
    render(<chart.Tile data={{ ...DATA, change: -12 }} status="ready" />);
    expect(screen.getByText("▼ 12%").className).toContain("down");
  });

  it("no previous week shows no change", () => {
    render(<chart.Tile data={{ ...DATA, change: null }} status="ready" />);
    expect(screen.queryByText(/▲|▼/)).toBeNull();
  });
});

describe("Stripe card", () => {
  const C = stripe.Card!;

  it("connecting asks for the restricted key", () => {
    render(<C data={null} status="sample" />);
    expect(screen.getByLabelText("Restricted key")).toBeTruthy();
  });

  it("shows today, 7 days and 30 days with Disconnect", () => {
    render(<C data={DATA} status="ready" />);
    for (const label of ["Today", "7 days", "30 days"]) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
  });

  it("labels test keys", () => {
    render(<C data={{ ...DATA, testMode: true }} status="ready" />);
    expect(screen.getByText("Test mode")).toBeTruthy();
  });

  it("disconnect deletes the key", async () => {
    render(<C data={DATA} status="ready" />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("secret_delete", { id: "stripe" }));
  });

  it("explains a problem in plain words", () => {
    render(<C data={DATA} status="stale" error={{ kind: "offline", message: "Can't reach Stripe." }} />);
    expect(screen.getByText("Can't reach Stripe.")).toBeTruthy();
  });
});

describe("GitHub Activity", () => {
  const days = [
    { date: "2026-10-10", level: 2, count: 3 },
    { date: new Date().toLocaleDateString("en-CA"), level: 4, count: 6 },
  ];

  it("shows counts over a 13 by 3 grid", () => {
    const { container } = render(<github.Tile data={{ days }} status="ready" />);
    expect(screen.getByText("today")).toBeTruthy();
    expect(screen.getByText("week")).toBeTruthy();
    expect(screen.getByText("streak")).toBeTruthy();
    expect(container.querySelectorAll(".gh__cell").length).toBe(39);
    expect(container.querySelectorAll('.gh__cell[data-level="4"]').length).toBe(1);
  });

  it("connecting checks the user with one real read, then saves it", async () => {
    mockInvoke.mockResolvedValue({ status: 200, body: "" });
    const C = github.Card!;
    render(<C data={null} status="sample" />);
    fireEvent.change(screen.getByLabelText("GitHub username"), { target: { value: "octocat" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(useSettings.getState().github.user).toBe("octocat"));
    expect(mockInvoke).toHaveBeenCalledWith("http_get", { req: { url: "https://github.com/users/octocat/contributions" } });
  });

  it("an unknown user stays out of settings and is explained", async () => {
    mockInvoke.mockResolvedValue({ status: 404, body: "" });
    const C = github.Card!;
    render(<C data={null} status="sample" />);
    fireEvent.change(screen.getByLabelText("GitHub username"), { target: { value: "nobody" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByText(/nobody/);
    expect(useSettings.getState().github.user).toBe("");
  });
});

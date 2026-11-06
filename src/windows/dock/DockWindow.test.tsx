import { render, screen } from "@testing-library/react";
import { DockWindow, Recovering } from "./DockWindow";

it("renders a bar", () => {
  render(<DockWindow />);
  expect(screen.getByTestId("bar")).toBeTruthy();
});

it("a dock that breaks draws itself again instead of leaving the screen empty", async () => {
  const { act } = await import("@testing-library/react");
  const { vi } = await import("vitest");
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  let broken = true;
  const Flaky = () => {
    if (broken) throw new Error("boom");
    return <div data-testid="back" />;
  };
  render(
    <Recovering>
      <Flaky />
    </Recovering>,
  );
  expect(screen.queryByTestId("back")).toBeNull();
  broken = false;
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByTestId("back")).toBeTruthy();
  vi.useRealTimers();
});

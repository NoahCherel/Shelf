import { render, screen } from "@testing-library/react";
import { DockWindow } from "./DockWindow";

it("renders a bar", () => {
  render(<DockWindow />);
  expect(screen.getByTestId("bar")).toBeTruthy();
});

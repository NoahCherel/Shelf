import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { Slider } from "./Slider";

const box = () => screen.getByRole("slider", { name: "Volume" }) as HTMLInputElement;

it("the slider follows the pointer and ignores new values until released", () => {
  const onChange = vi.fn();
  const { rerender } = render(<Slider value={40} label="Volume" onChange={onChange} />);
  fireEvent.pointerDown(box());
  fireEvent.change(box(), { target: { value: "70" } });
  expect(onChange).toHaveBeenCalledWith(70);
  rerender(<Slider value={40} label="Volume" onChange={onChange} />);
  rerender(<Slider value={12} label="Volume" onChange={onChange} />);
  expect(box().value).toBe("70");
  fireEvent.pointerUp(document);
  rerender(<Slider value={70} label="Volume" onChange={onChange} />);
  rerender(<Slider value={33} label="Volume" onChange={onChange} />);
  expect(box().value).toBe("33");
});

it("the slider doesn't jump back between release and the next reading", () => {
  const { rerender } = render(<Slider value={40} label="Volume" onChange={() => {}} />);
  fireEvent.pointerDown(box());
  fireEvent.change(box(), { target: { value: "70" } });
  fireEvent.pointerUp(document);
  rerender(<Slider value={40} label="Volume" onChange={() => {}} />);
  expect(box().value).toBe("70");
});

it("the slider clamps to 0-100", () => {
  render(<Slider value={140} label="Volume" onChange={() => {}} />);
  expect(box().value).toBe("100");
});

it("the slider moves with the arrow keys", () => {
  const onChange = vi.fn();
  render(<Slider value={40} label="Volume" onChange={onChange} />);
  fireEvent.keyDown(box(), { key: "ArrowRight" });
  expect(onChange).toHaveBeenLastCalledWith(42);
  fireEvent.keyDown(box(), { key: "ArrowLeft" });
  expect(onChange).toHaveBeenLastCalledWith(40);
});

it("arrow keys don't go past the ends", () => {
  const onChange = vi.fn();
  render(<Slider value={100} label="Volume" onChange={onChange} />);
  fireEvent.keyDown(box(), { key: "ArrowRight" });
  expect(onChange).toHaveBeenLastCalledWith(100);
});

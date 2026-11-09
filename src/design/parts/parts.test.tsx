import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { Tile } from "./Tile";
import { Ring } from "./Ring";
import { Bar, levelFor } from "./Bar";
import { endY, smoothPath, Sparkline } from "./Sparkline";
import { RoundButton } from "./RoundButton";
import { Row } from "./Row";
import { setDockSize, setStyle, setTheme } from "../theme";

describe("Tile", () => {
  it("Tile width scales from T", () => {
    render(<Tile width={3.1}>x</Tile>);
    expect(screen.getByText("x").getAttribute("style")).toContain("calc(var(--T) * 3.1)");
  });

  it("is a button only when it can be clicked", () => {
    const onClick = vi.fn();
    render(<Tile width={1} onClick={onClick}>x</Tile>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is not a button without a click handler", () => {
    render(<Tile width={1}>x</Tile>);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("Ring", () => {
  const dash = (c: HTMLElement) => c.querySelector("[data-role=value]")?.getAttribute("stroke-dasharray");

  it("Ring clamps percent to 0–100", () => {
    const full = render(<Ring percent={140} size={1} />);
    expect(dash(full.container)).toBe("100 100");
    const none = render(<Ring percent={-5} size={1} />);
    expect(none.container.querySelector("[data-role=value]")).toBeNull();
  });

  it("draws the given percent", () => {
    const { container } = render(<Ring percent={42} size={1} />);
    expect(dash(container)).toBe("42 100");
  });
});

describe("Bar", () => {
  it("Bar picks level from percent when none is given", () => {
    expect(levelFor(41)).toBe("good");
    expect(levelFor(70)).toBe("warn");
    expect(levelFor(90)).toBe("full");
  });

  it("uses the given level over the percent", () => {
    const { container } = render(<Bar percent={95} level="good" />);
    expect(container.querySelector("[data-level]")?.getAttribute("data-level")).toBe("good");
  });

  it("clamps its fill width", () => {
    const { container } = render(<Bar percent={150} />);
    expect((container.querySelector("[data-level]") as HTMLElement).style.width).toBe("100%");
  });
});

describe("Sparkline", () => {
  it("Sparkline draws nothing for empty values and a flat line for equal ones", () => {
    expect(smoothPath([])).toBe("");
    expect(smoothPath([5, 5, 5]).startsWith("M0 35")).toBe(true);
  });

  it("draws one value as a flat line instead of breaking", () => {
    expect(smoothPath([7]).startsWith("M0 35")).toBe(true);
  });

  it("puts the highest value at the top and the lowest at the bottom", () => {
    const path = smoothPath([0, 10]);
    expect(path.startsWith("M0 60")).toBe(true);
    expect(path.endsWith(" 100 10")).toBe(true);
  });

  it("renders no path element for empty input", () => {
    const { container } = render(<Sparkline values={[]} color="red" />);
    expect(container.querySelector("path")).toBeNull();
  });

  it("adds an area and end dot only when asked", () => {
    const { container } = render(<Sparkline values={[1, 2]} color="red" fill />);
    expect(container.querySelectorAll("path").length).toBe(2);
    expect(container.querySelector(".spark__dot")).toBeTruthy();
    const plain = render(<Sparkline values={[1, 2]} color="red" />);
    expect(plain.container.querySelector(".spark__dot")).toBeNull();
  });
});

describe("smoothPath", () => {
  it("passes through the first and last points, keeping headroom above the line", () => {
    const path = smoothPath([0, 10, 5]);
    expect(path.startsWith("M0 ")).toBe(true);
    expect(path.includes("C")).toBe(true);
    expect(path.endsWith(` 100 ${endY([0, 10, 5])}`)).toBe(true);
    expect(endY([0, 10])).toBeLessThan(endY([10, 0]));
  });

  it("is empty for no values", () => {
    expect(smoothPath([])).toBe("");
  });
});

describe("RoundButton and Row", () => {
  it("RoundButton is named by its label and clicks", () => {
    const onClick = vi.fn();
    render(<RoundButton icon={<i />} label="Play" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("Row shows label, detail and value", () => {
    render(<Row label="Session" detail="resets 2h" value="41%" />);
    expect(screen.getByText("Session")).toBeTruthy();
    expect(screen.getByText("resets 2h")).toBeTruthy();
    expect(screen.getByText("41%")).toBeTruthy();
  });
});

describe("theme", () => {
  it("setDockSize sets --T in px", () => {
    setDockSize(62);
    expect(document.documentElement.style.getPropertyValue("--T")).toBe("62px");
  });

  it("setStyle and setTheme mark the root", () => {
    setStyle("black");
    setTheme("light");
    expect(document.documentElement.dataset.style).toBe("black");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

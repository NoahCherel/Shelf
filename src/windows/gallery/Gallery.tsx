import { Tile } from "../../design/parts/Tile";
import { Bar } from "../../design/parts/Bar";
import { setDockSize } from "../../design/theme";
import "./gallery.css";

const T = (x: number) => `calc(var(--T) * ${x})`;

/** Sample tiles for visual checks. Opened with ?w=gallery&t=148, and &font=inter to force a candidate. */
export function Gallery() {
  const q = new URLSearchParams(location.search);
  // Sizes derive from T at the root, so it has to be set there, as the dock does.
  setDockSize(Number(q.get("t") ?? 50));
  if (q.get("font") === "inter") document.documentElement.style.setProperty("--font", '"Inter Variable"');
  return (
    <div className="gallery">
      <Tile width={2.82}>
        <div className="g-logo" />
        <div className="g-abs g-label" style={{ left: T(1.027), top: T(0.135) }}>Session</div>
        <div className="g-abs g-second" style={{ right: T(0.135), top: T(0.135) }}>1h 25m</div>
        <div className="g-abs g-value" style={{ left: T(1.027), top: T(0.42) }}>100%</div>
        <div className="g-abs" style={{ left: T(1.027), right: T(0.135), top: T(0.757) }}>
          <Bar percent={100} level="good" />
        </div>
      </Tile>
      <Tile width={3.21}>
        <div className="g-abs g-label" style={{ left: T(0.392), top: T(0.1) }}>Net revenue</div>
        <div className="g-abs g-value" style={{ right: T(0.19), top: T(0.088), fontSize: T(0.22) }}>$2,980</div>
        <div className="g-abs" style={{ right: T(0.19), top: T(0.338), color: "var(--good)", fontSize: "var(--fs-second)", fontWeight: 600 }}>▲ 31%</div>
      </Tile>
      <Tile width={3.12}>
        <div className="g-abs g-second" style={{ left: T(0.257), top: T(0.203), fontSize: T(0.19), fontWeight: 600 }}>Thursday</div>
        <div className="g-abs g-large" style={{ left: T(0.257), top: T(0.453), letterSpacing: "-.02em" }}>October 1</div>
      </Tile>
    </div>
  );
}

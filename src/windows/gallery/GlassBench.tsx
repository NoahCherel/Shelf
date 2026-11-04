import { useEffect, useRef } from "react";
import { createPainter } from "../../design/glass/GlassLayer";
import { setDockSize } from "../../design/theme";
import { byId } from "../../core/registry";
import { widthOf } from "../../core/widget";
import "../dock/dock.css";
import "./gallery.css";

const SHOWN = ["stripe-chart", "apps", "github-activity", "clock-and-weather"];

/** Our own test scene: bright curves on dark, so bending shows up at the bar's edges. */
function paintScene(g: CanvasRenderingContext2D, w: number, h: number, kind: string) {
  g.fillStyle = "#07060c";
  g.fillRect(0, 0, w, h);
  if (kind === "glow") {
    const glow = g.createRadialGradient(w / 2, -h * 0.6, h * 0.5, w / 2, -h * 0.6, h * 1.75);
    glow.addColorStop(0, "#7a0a64");
    glow.addColorStop(0.62, "#c81e6e");
    glow.addColorStop(0.8, "#f4b2ff");
    glow.addColorStop(0.86, "#ffd65a");
    glow.addColorStop(0.93, "#d97a12");
    glow.addColorStop(1, "#1a0806");
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    return;
  }
  // Hard-edged ribbons, the hardest thing to bend convincingly.
  ["#ff2d6f", "#ffb000", "#7a5cff", "#21d4fd"].forEach((color, i) => {
    g.strokeStyle = color;
    g.lineWidth = 26 - i * 4;
    g.beginPath();
    g.moveTo(-20, h * (0.2 + i * 0.2));
    g.bezierCurveTo(w * 0.3, h * (1.1 - i * 0.25), w * 0.6, h * (0.1 + i * 0.2), w + 20, h * (0.85 - i * 0.15));
    g.stroke();
  });
}

/** The real shader and tiles over a test scene, in a browser. ?w=gallery&glass=glow|ribbons&t=92 */
export function GlassBench() {
  const q = new URLSearchParams(location.search);
  setDockSize(Number(q.get("t") ?? 92));
  document.documentElement.dataset.style = "liquid";
  document.documentElement.dataset.theme = "dark";
  const scene = useRef<HTMLCanvasElement>(null);
  const glass = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const back = scene.current!;
    const bar = glass.current!.parentElement!;
    const scale = window.devicePixelRatio || 1;
    back.width = innerWidth * scale;
    back.height = innerHeight * scale;
    const g = back.getContext("2d", { willReadFrequently: true })!;
    paintScene(g, back.width, back.height, q.get("glass") ?? "glow");

    const painter = createPainter(glass.current!);
    if (!painter) {
      document.title = "no webgl";
      return;
    }
    painter.layout();
    const r = bar.getBoundingClientRect();
    const [x, y, w, h] = [r.left, r.top, r.width, r.height].map((v) => Math.round(v * scale));
    const rgba = g.getImageData(x, y, w, h).data;
    const out = new Uint8Array(8 + rgba.length);
    new DataView(out.buffer).setUint32(0, w, true);
    new DataView(out.buffer).setUint32(4, h, true);
    for (let i = 0; i < rgba.length; i += 4) {
      out[8 + i] = rgba[i + 2];
      out[9 + i] = rgba[i + 1];
      out[10 + i] = rgba[i];
      out[11 + i] = 255;
    }
    painter.draw(out.buffer);
  }, []);

  return (
    <div className="bench">
      <canvas className="bench__scene" ref={scene} />
      <div className="dock bench__bar" data-glass="true">
        <canvas className="glass" ref={glass} aria-hidden="true" />
        {SHOWN.map((id) => {
          const def = byId(id);
          if (!def) return null;
          const T = def.Tile;
          return (
            <div key={id} className="slot" style={{ width: `calc(var(--T) * ${widthOf(def, def.sample ?? null)})` }}>
              <T data={def.sample ?? null} status="sample" preview />
            </div>
          );
        })}
      </div>
    </div>
  );
}

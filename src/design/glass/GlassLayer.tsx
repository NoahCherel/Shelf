import { useEffect, useRef } from "react";
import { invoke, listen } from "../../core/tauri";
import fragment from "./refract.frag?raw";
import "./glass.css";

const MAX_TILES = 16;

const VERTEX = "attribute vec2 p; varying vec2 uv; void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }";

/** Values tuned by eye against the reference; the study's glass notes record them. */
const LOOK = {
  lensBand: 24,
  lensStrength: 22,
  softUnderTiles: 2.6,
  /** On dark, tiles darken what's behind them to this share of its brightness. */
  tileBrightness: 0.46,
  /** On light, they wash it toward white instead, so dark text stays readable. */
  tileLift: 0.62,
  tintAmount: 0.02,
  rimStrength: 0.58,
};

export interface Painter {
  draw(buffer: ArrayBuffer): void;
  layout(): void;
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader failed");
  return shader;
}

export function createPainter(canvas: HTMLCanvasElement): Painter | null {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  for (const [key, value] of [
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
    [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
  ]) {
    gl.texParameteri(gl.TEXTURE_2D, key, value);
  }

  const uniform = (name: string) => gl.getUniformLocation(program, name);
  let hasFrame = false;
  const paint = () => {
    if (hasFrame) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  return {
    draw(buffer) {
      const head = new DataView(buffer);
      const width = head.getUint32(0, true);
      const height = head.getUint32(4, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(buffer, 8));
      hasFrame = true;
      paint();
    },
    layout() {
      const parent = canvas.parentElement;
      if (!parent) return;
      const scale = window.devicePixelRatio || 1;
      const bar = parent.getBoundingClientRect();
      canvas.width = Math.round(bar.width * scale);
      canvas.height = Math.round(bar.height * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniform("size"), canvas.width, canvas.height);
      gl.uniform1f(uniform("scale"), scale);
      const style = getComputedStyle(document.documentElement);
      const T = parseFloat(style.getPropertyValue("--T")) || 50;
      gl.uniform1f(uniform("openEnds"), parent.dataset.width === "full" ? 1 : 0);
      gl.uniform1f(uniform("radius"), (parseFloat(getComputedStyle(parent).borderTopLeftRadius) || 0) * scale);
      gl.uniform1f(uniform("lensBand"), LOOK.lensBand * scale);
      gl.uniform1f(uniform("lensStrength"), LOOK.lensStrength * scale);
      gl.uniform1f(uniform("softUnderTiles"), LOOK.softUnderTiles * scale);
      const light = document.documentElement.dataset.theme === "light";
      gl.uniform1f(uniform("tileBrightness"), light ? 1 : LOOK.tileBrightness);
      gl.uniform1f(uniform("tileLift"), light ? LOOK.tileLift : 0);
      gl.uniform1f(uniform("tileRadius"), T * 0.24 * scale);
      gl.uniform3f(uniform("tint"), 1, 1, 1);
      gl.uniform1f(uniform("tintAmount"), LOOK.tintAmount);
      gl.uniform1f(uniform("rimStrength"), LOOK.rimStrength);

      // Softening only happens under tiles; bare app icons sit on the clear glass.
      const rects = [...parent.querySelectorAll(".tile")]
        .map((tile) => tile.getBoundingClientRect())
        .filter((r) => r.right > bar.left && r.left < bar.right)
        .slice(0, MAX_TILES);
      gl.uniform1i(uniform("tileCount"), rects.length);
      rects.forEach((r, i) => {
        gl.uniform4f(uniform(`tiles[${i}]`), (r.left - bar.left) * scale, (r.top - bar.top) * scale, r.width * scale, r.height * scale);
      });
      paint();
    },
  };
}

export interface GlassLayerProps {
  active: boolean;
  /** Called when capture or WebGL can't run here, so the bar can fall back to a solid look. */
  onUnavailable?: () => void;
}

export function GlassLayer({ active, onUnavailable }: GlassLayerProps) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) {
      invoke("glass_stop").catch(() => {});
      return;
    }
    let live = true;
    let painter: Painter | null = null;
    try {
      painter = canvas.current ? createPainter(canvas.current) : null;
    } catch {
      onUnavailable?.();
    }

    // One collection at a time, and at most one more queued: only the newest frame matters.
    let busy = false;
    let again = false;
    const collect = async () => {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        const buffer = await invoke<ArrayBuffer | null>("glass_frame");
        if (live && buffer && buffer.byteLength > 8) painter?.draw(buffer);
      } finally {
        busy = false;
      }
      if (again && live) {
        again = false;
        void collect();
      }
    };

    const off = listen("glass-frame", collect);
    const observer = new ResizeObserver(() => painter?.layout());
    if (canvas.current?.parentElement) observer.observe(canvas.current.parentElement);
    // A narrowed dock scrolls its tiles under the glass.
    const scroller = canvas.current?.parentElement?.querySelector(".dock__scroll");
    const relayout = () => painter?.layout();
    scroller?.addEventListener("scroll", relayout, { passive: true });
    // Dark and light tint the tiles differently.
    const themeWatch = new MutationObserver(() => painter?.layout());
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    painter?.layout();
    invoke("glass_start").catch(() => {
      if (live) onUnavailable?.();
    });

    return () => {
      live = false;
      observer.disconnect();
      scroller?.removeEventListener("scroll", relayout);
      themeWatch.disconnect();
      off.then((stop) => stop());
      invoke("glass_stop").catch(() => {});
    };
  }, [active, onUnavailable]);

  return active ? <canvas className="glass" ref={canvas} aria-hidden="true" /> : null;
}

import { useEffect, useRef } from "react";
import { setDockSize } from "../../design/theme";
import { panels, type PanelId } from "../../panels";
import { CardContent } from "../card/CardWindow";
import { DockWindow } from "../dock/DockWindow";
import { PickerWindow } from "../picker/PickerWindow";
import { PreviewStrip } from "../preview/PreviewWindow";
import { SettingsWindow } from "../settings/SettingsWindow";
import { paintWallpaper, scenes, type Scene } from "./scenes";
import "./bench.css";

const PICKER_T = 62;

/** Centres the card on its tile and keeps it on screen, as Rust does for the real window. */
function useCardPlacement(scene: Scene) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const place = () => {
      const el = card.current;
      if (!el) return;
      const tileId = scene.card!.replace("__menu:", "");
      const tile = document.querySelector(scene.anchor ?? `[data-widget-id="${tileId}"]`)?.getBoundingClientRect();
      if (!tile) return;
      const width = el.getBoundingClientRect().width;
      const left = Math.min(innerWidth - width - 8, Math.max(8, tile.left + tile.width / 2 - width / 2));
      el.style.left = `${left}px`;
    };
    const timer = setInterval(place, 100);
    return () => clearInterval(timer);
  }, [scene]);
  return card;
}

function CardLayer({ scene }: { scene: Scene }) {
  const card = useCardPlacement(scene);
  const id = scene.card!;
  const width = id.startsWith("__menu:") ? 210 : id.startsWith("__panel:") ? panels[id.slice(8) as PanelId].width : 340;
  return (
    <div className="bench__card" ref={card} style={{ width }}>
      <CardContent id={scene.card!} n={1} />
    </div>
  );
}

function SceneView({ scene }: { scene: Scene }) {
  const wallpaper = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = wallpaper.current!;
    const scale = window.devicePixelRatio || 1;
    canvas.width = innerWidth * scale;
    canvas.height = innerHeight * scale;
    paintWallpaper(canvas.getContext("2d", { willReadFrequently: true })!, canvas.width, canvas.height, scene.wallpaper);
    if (scene.view === "picker") setDockSize(PICKER_T);
  }, [scene]);
  return (
    <div className="bench">
      <canvas className="bench__scene" ref={wallpaper} />
      {scene.view === "picker" && <PickerWindow />}
      {scene.view === "settings" && <SettingsWindow />}
      {scene.dock && (
        <div className="bench__dock">
          <DockWindow />
        </div>
      )}
      {scene.card && <CardLayer scene={scene} />}
      {scene.previews && (
        <div className="bench__previews" style={{ width: scene.previews.windows.length * (scene.previews.slotWidth + 8) + 8 }}>
          <PreviewStrip shown={scene.previews} onClosed={() => {}} />
        </div>
      )}
    </div>
  );
}

/** One scene of the visual bench: ?w=bench&scene=<id>. See src/test/bench/run.mjs. */
export function BenchWindow() {
  const id = new URLSearchParams(location.search).get("scene");
  const scene = scenes.find((s) => s.id === id);
  if (!scene) return <p className="bench__missing">No scene called "{id}"</p>;
  return <SceneView scene={scene} />;
}

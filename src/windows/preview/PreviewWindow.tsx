import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { invoke, listen } from "../../core/tauri";
import "./preview.css";

export interface ShownWindow {
  hwnd: number;
  title: string;
  minimized: boolean;
}

export interface Shown {
  key: string;
  name: string;
  slotWidth: number;
  windows: ShownWindow[];
}

function AppIcon({ appKey, name }: { appKey: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    Promise.resolve(invoke<string | null>("apps_icon", { key: appKey })).then(
      (icon) => live && setSrc(icon ?? null),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [appKey]);
  if (src) return <img className="pv__icon" src={src} alt="" draggable={false} />;
  return <span className="pv__icon pv__icon--blank">{name.charAt(0).toUpperCase()}</span>;
}

const PEEK_PAUSE_MS = 250;
/** Long enough to cross the gap to the next picture, without the window flashing back. */
const LET_GO_MS = 120;

/** Rust drops anything older than the newest it has seen, so this has to outlive the strip. */
let lastPeek = 0;

/** Resting on a picture shows that window, and the next picture follows at once. */
function usePeek() {
  const pause = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const letGo = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shown = useRef<number | null>(null);
  const warm = useRef(false);
  const send = (hwnd: number | null) => {
    shown.current = hwnd;
    invoke("preview_peek", { hwnd, seq: ++lastPeek }).catch(() => {});
  };
  useEffect(
    () => () => {
      clearTimeout(pause.current);
      clearTimeout(letGo.current);
    },
    [],
  );
  return {
    /** Also runs as the pointer moves, so a missed event can't leave it stuck the wrong way. */
    over(hwnd: number) {
      clearTimeout(letGo.current);
      if (shown.current === hwnd) return;
      if (warm.current) {
        clearTimeout(pause.current);
        send(hwnd);
        return;
      }
      clearTimeout(pause.current);
      pause.current = setTimeout(() => {
        warm.current = true;
        send(hwnd);
      }, PEEK_PAUSE_MS);
    },
    away() {
      clearTimeout(pause.current);
      if (shown.current === null) return;
      clearTimeout(letGo.current);
      letGo.current = setTimeout(() => send(null), LET_GO_MS);
    },
    leaveStrip() {
      warm.current = false;
    },
  };
}

/** The strip itself. Windows draws each live picture over its frame. */
export function PreviewStrip({ shown, onClosed }: { shown: Shown; onClosed: (hwnd: number) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const peek = usePeek();

  // Every change of layout moves the pictures, which sit outside the page.
  useLayoutEffect(() => {
    const frames = [...(strip.current?.querySelectorAll<HTMLElement>("[data-hwnd]") ?? [])];
    const slots = frames.map((frame) => {
      const r = frame.getBoundingClientRect();
      return { hwnd: Number(frame.dataset.hwnd), x: r.left, y: r.top, width: r.width, height: r.height };
    });
    invoke("preview_slots", { slots }).catch(() => {});
  }, [shown]);

  return (
    <div
      className="pv"
      ref={strip}
      style={{ "--slot": `${shown.slotWidth}px` } as CSSProperties}
      onMouseEnter={() => invoke("preview_keep").catch(() => {})}
      onMouseLeave={() => {
        peek.leaveStrip();
        invoke("preview_leave").catch(() => {});
      }}
    >
      {shown.windows.map((window) => {
        const title = window.title || shown.name;
        return (
          <div
            key={window.hwnd}
            className="pv__window"
            onClick={() => invoke("preview_activate", { hwnd: window.hwnd }).catch(() => {})}
            onMouseEnter={() => peek.over(window.hwnd)}
            onMouseMove={() => peek.over(window.hwnd)}
            onMouseLeave={peek.away}
          >
            <div className="pv__head">
              <span className="pv__title">{title}</span>
              <button
                type="button"
                className="pv__close"
                aria-label={`Close ${title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  peek.away();
                  invoke("preview_close_window", { hwnd: window.hwnd }).catch(() => {});
                  onClosed(window.hwnd);
                }}
              >
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M2.500 2.500l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.500" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {/* Windows may have no picture of a window minimized since it started, so the icon waits underneath. */}
            <div className="pv__frame" data-hwnd={window.hwnd}>
              {window.minimized && <AppIcon appKey={shown.key} name={shown.name} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PreviewWindow() {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    const offShow = listen<Shown>("preview-show", setShown);
    const offClosed = listen("preview-closed", () => setShown(null));
    return () => {
      offShow.then((stop) => stop());
      offClosed.then((stop) => stop());
    };
  }, []);

  if (!shown) return null;

  const closed = (hwnd: number) => {
    const windows = shown.windows.filter((w) => w.hwnd !== hwnd);
    if (windows.length === 0) invoke("preview_hide").catch(() => {});
    else setShown({ ...shown, windows });
  };
  return <PreviewStrip shown={shown} onClosed={closed} />;
}

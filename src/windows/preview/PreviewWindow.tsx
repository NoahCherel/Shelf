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

/** Resting on a picture shows that window, and the next picture follows at once. */
function usePeek() {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peeking = useRef(false);
  const send = (hwnd: number | null) => invoke("preview_peek", { hwnd }).catch(() => {});
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    enter(hwnd: number) {
      clearTimeout(timer.current);
      if (peeking.current) {
        send(hwnd);
        return;
      }
      timer.current = setTimeout(() => {
        peeking.current = true;
        send(hwnd);
      }, PEEK_PAUSE_MS);
    },
    leave() {
      clearTimeout(timer.current);
      if (peeking.current) send(null);
    },
    leaveStrip() {
      clearTimeout(timer.current);
      peeking.current = false;
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
            onMouseEnter={() => peek.enter(window.hwnd)}
            onMouseLeave={peek.leave}
          >
            <div className="pv__head">
              <span className="pv__title">{title}</span>
              <button
                type="button"
                className="pv__close"
                aria-label={`Close ${title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  peek.leave();
                  invoke("preview_close_window", { hwnd: window.hwnd }).catch(() => {});
                  onClosed(window.hwnd);
                }}
              >
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M2.500 2.500l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.500" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {window.minimized ? (
              <div className="pv__frame">
                <AppIcon appKey={shown.key} name={shown.name} />
              </div>
            ) : (
              <div className="pv__frame" data-hwnd={window.hwnd} />
            )}
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

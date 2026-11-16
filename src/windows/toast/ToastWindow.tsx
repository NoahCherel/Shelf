import { useCallback, useEffect, useRef, useState } from "react";
import { emit, invoke, listen } from "../../core/tauri";
import type { Toast } from "../../core/toast";
import "./toast.css";

/** How long a toast stays, not counting time with the pointer on it. */
export const TOAST_MS = 8000;

/** The time left runs only while the pointer is away. */
function useCountdown(toast: Toast | null, onEnd: () => void) {
  const left = useRef(TOAST_MS);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startedAt = useRef(0);

  const run = useCallback(() => {
    clearTimeout(timer.current);
    startedAt.current = Date.now();
    timer.current = setTimeout(onEnd, left.current);
  }, [onEnd]);

  const hold = useCallback(() => {
    clearTimeout(timer.current);
    left.current = Math.max(0, left.current - (Date.now() - startedAt.current));
  }, []);

  useEffect(() => {
    if (!toast) return;
    left.current = TOAST_MS;
    run();
    return () => clearTimeout(timer.current);
  }, [toast, run]);

  return { hold, run };
}

export function ToastWindow() {
  const [toast, setToast] = useState<Toast | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<Toast | null>("toast_current").then((t) => t && setToast(t), () => {});
    const off = listen<Toast>("toast-show", setToast);
    return () => void off.then((f) => f());
  }, []);

  const end = useCallback(() => {
    setToast(null);
    invoke("toast_done").catch(() => {});
  }, []);
  const { hold, run } = useCountdown(toast, end);

  // Rust places and shows the window once it knows how tall the toast is.
  useEffect(() => {
    const el = box.current;
    if (!el || !toast) return;
    const fit = () => {
      const height = el.offsetHeight;
      if (height > 0) invoke("toast_fit", { height }).catch(() => {});
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [toast]);

  if (!toast) return null;
  const action = toast.action;
  return (
    <div className="toast" role="status" ref={box} key={toast.id + toast.title} onPointerEnter={hold} onPointerLeave={run}>
      <div className="toast__text">
        <p className="toast__title">{toast.title}</p>
        <p className="toast__body">{toast.body}</p>
      </div>
      {action && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            emit("open-request", { target: action.target }).catch(() => {});
            end();
          }}
        >
          {action.label}
        </button>
      )}
      <button type="button" className="toast__close" aria-label="Dismiss" onClick={end}>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 2.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

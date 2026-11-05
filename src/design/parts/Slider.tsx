import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import "./parts.css";

const KEY_STEP = 2;

const clamp = (v: number) => Math.min(100, Math.max(0, v));

export interface SliderProps {
  value: number;
  label: string;
  onChange: (value: number) => void;
}

/** A 0-100 slider. While dragged it holds its own value, so a reading arriving mid-drag can't move it. */
export function Slider({ value, label, onChange }: SliderProps) {
  const [held, setHeld] = useState<number | null>(null);
  const dragging = useRef(false);

  // Kept after release until a new reading arrives, or it would jump back for a moment.
  useEffect(() => {
    if (!dragging.current) setHeld(null);
  }, [value]);

  const shown = clamp(held ?? value);
  const move = (next: number) => {
    const v = clamp(next);
    setHeld(v);
    onChange(v);
  };
  const press = () => {
    dragging.current = true;
    const release = () => {
      dragging.current = false;
      document.removeEventListener("pointerup", release);
    };
    document.addEventListener("pointerup", release);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") move(shown + KEY_STEP);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") move(shown - KEY_STEP);
    else return;
    e.preventDefault();
  };

  return (
    <input
      type="range"
      className="pslider"
      aria-label={label}
      min={0}
      max={100}
      value={shown}
      style={{ "--level": `${shown}%` } as CSSProperties}
      onPointerDown={press}
      onChange={(e) => move(Number(e.target.value))}
      onKeyDown={key}
    />
  );
}

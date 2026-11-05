import "./parts.css";

export function Switch({ label, on, onFlip }: { label: string; on: boolean; onFlip: () => void }) {
  return (
    <button type="button" role="switch" aria-label={label} aria-checked={on} className={on ? "switch switch--on" : "switch"} onClick={onFlip}>
      <i />
    </button>
  );
}

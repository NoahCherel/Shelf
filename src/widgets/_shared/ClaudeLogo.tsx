import "./claude.css";

const RAYS = Array.from({ length: 12 }, (_, i) => i * 30);
const LENGTHS = [15, 12, 14, 11.5, 15, 12.5, 14, 11, 15, 12, 14.5, 11.5];

/** Our own 12-ray spark on the orange square. */
export function ClaudeLogo() {
  return (
    <span className="claude-logo">
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <g stroke="#2a2a2c" strokeWidth="2.5" strokeLinecap="round">
          {RAYS.map((angle, i) => (
            <line key={angle} x1="20" y1="20" x2="20" y2={20 - LENGTHS[i]} transform={`rotate(${angle + 8} 20 20)`} />
          ))}
        </g>
      </svg>
    </span>
  );
}

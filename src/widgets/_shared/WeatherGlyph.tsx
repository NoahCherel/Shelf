import { weatherKind, type WeatherKind } from "../_providers/weather";

const CLOUD = "M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.6 4.5 4.5 0 0 0 7 18.5Z";

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

const art: Record<WeatherKind, React.ReactNode> = {
  sun: (
    <>
      <g stroke="#ffcc00" strokeWidth="2" strokeLinecap="round">
        {RAYS.map((a) => (
          <line key={a} x1="12" y1="2.6" x2="12" y2="5" transform={`rotate(${a} 12 12)`} />
        ))}
      </g>
      <circle cx="12" cy="12" r="4.6" fill="#ffd60a" />
    </>
  ),
  cloud: <path d={CLOUD} fill="#c7c7cc" />,
  rain: (
    <>
      <path d={CLOUD} transform="translate(0 -3)" fill="#c7c7cc" />
      <path d="M8.5 18l-1 3m5-3l-1 3m5-3l-1 3" stroke="#5ac8fa" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  snow: (
    <>
      <path d={CLOUD} transform="translate(0 -3)" fill="#c7c7cc" />
      <path d="M8 19.5h.01M12 21h.01M16 19.5h.01" stroke="#e5f4ff" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  storm: (
    <>
      <path d={CLOUD} transform="translate(0 -3)" fill="#8e8e93" />
      <path d="M13 15.5l-3 4h3l-1.5 3.5" fill="none" stroke="#ffd60a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export function WeatherGlyph({ code, className }: { code: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {art[weatherKind(code)]}
    </svg>
  );
}

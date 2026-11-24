import type { WidgetDef } from "../../core/widget";
import { widthOf } from "../../core/widget";
import { CATEGORIES } from "../../core/categories";
import { allWidgetIds, useLayout } from "../../core/layout";

function Pick({ def }: { def: WidgetDef }) {
  const inBar = useLayout((s) => allWidgetIds(s.ids, s.folders).includes(def.id));
  const { add, remove } = useLayout.getState();
  const C = def.Tile;
  const toggle = () => (inBar ? remove(def.id) : add(def.id));
  return (
    <div
      role="button"
      tabIndex={0}
      className="pick"
      aria-label={def.name}
      aria-pressed={inBar}
      title={def.description}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <div className="pick__tile" inert style={{ width: `calc(var(--T) * ${widthOf(def, def.sample ?? null)})` }}>
        <C data={def.sample ?? null} status="sample" preview />
        {inBar && (
          <span className="pick__check" aria-hidden="true">
            <svg viewBox="0 0 12 12">
              <path d="M2.500 6.500 5 9l4.500-5.500" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </div>
      <span className="pick__name">{def.name}</span>
    </div>
  );
}

export function WidgetGrid({ groups }: { groups: Map<string, WidgetDef[]> }) {
  return (
    <>
      {CATEGORIES.filter((c) => groups.get(c.id)?.length).map((c) => (
        <section key={c.id} id={`section-${c.id}`} aria-labelledby={`title-${c.id}`} className="section">
          <h2 id={`title-${c.id}`} className="section__title">
            <i className="side__icon" style={{ background: c.color }} aria-hidden="true" />
            {c.label}
          </h2>
          <div className="section__tiles">
            {groups.get(c.id)!.map((def) => (
              <Pick key={def.id} def={def} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

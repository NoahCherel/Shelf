import { useEffect, useRef, useState } from "react";
import { useLayout } from "../../core/layout";
import { pinId } from "../../core/pinWidget";
import { invoke } from "../../core/tauri";

interface App {
  id: string;
  name: string;
}

const targetOf = (app: App) => app.id.replace(/^app:/, "");

function AppChoice({ app }: { app: App }) {
  const id = pinId("app", targetOf(app));
  const inBar = useLayout((s) => s.ids.includes(id));
  const [icon, setIcon] = useState<string | null>(null);
  const box = useRef<HTMLButtonElement>(null);

  // There can be hundreds of these, and each picture is a lookup, so only those in view ask.
  useEffect(() => {
    const ask = () => Promise.resolve(invoke<string | null>("search_icon", { id: app.id })).then((found) => setIcon(found ?? null), () => {});
    if (typeof IntersectionObserver === "undefined" || !box.current) return void ask();
    const observer = new IntersectionObserver((seen) => {
      if (seen.some((s) => s.isIntersecting)) {
        observer.disconnect();
        ask();
      }
    });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, [app.id]);

  const { add, remove } = useLayout.getState();
  return (
    <button ref={box} type="button" className="choice" aria-label={app.name} aria-pressed={inBar} title={app.name} onClick={() => (inBar ? remove(id) : add(id))}>
      {icon ? <img className="choice__icon" src={icon} alt="" draggable={false} /> : <span className="choice__icon choice__icon--blank" aria-hidden="true" />}
      <span className="choice__name">{app.name}</span>
    </button>
  );
}

/** Any installed app or any folder, as a widget of its own. */
export function WidgetChoices({ query }: { query: string }) {
  const [apps, setApps] = useState<App[]>([]);
  useEffect(() => {
    Promise.resolve(invoke<App[]>("search_apps")).then((list) => setApps(list ?? []), () => {});
  }, []);
  const addFolder = () => {
    Promise.resolve(invoke<string | null>("pick_folder")).then((path) => path && useLayout.getState().add(pinId("folder", path)), () => {});
  };
  const q = query.trim().toLowerCase();
  const shown = apps.filter((a) => a.name.toLowerCase().includes(q));
  return (
    <section className="section" aria-labelledby="title-your-apps">
      <div className="choices__head">
        <h2 id="title-your-apps" className="section__title">
          Your apps and folders
        </h2>
        <button type="button" className="choices__folder" onClick={addFolder}>
          Add a folder…
        </button>
      </div>
      <div className="choices">
        {shown.map((app) => (
          <AppChoice key={app.id} app={app} />
        ))}
      </div>
    </section>
  );
}

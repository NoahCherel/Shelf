import { saveStartImage, shrinkImage } from "../../core/startImage";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { appVersion, invoke, listen } from "../../core/tauri";
import { Switch } from "../../design/parts/Switch";
import { useSettings } from "../../core/settings";
import { ACCENTS, readPath, writePath, type RowDef, type SectionDef } from "./schema";

function useValue<V>(key: string): [V, (value: V) => void] {
  const value = useSettings(() => readPath(key)) as V;
  return [value, (next) => writePath(key, next)];
}

function ToggleRow({ row }: { row: Extract<RowDef, { kind: "toggle" }> }) {
  const [saved, save] = useValue<boolean>(row.key);
  const [external, setExternal] = useState(false);
  const source = row.external;
  useEffect(() => {
    source?.read().then((on) => setExternal(Boolean(on)), () => {});
  }, [source]);
  if (source) {
    const flip = () => {
      const next = !external;
      setExternal(next);
      // Read back either way: if the write was refused, the switch must not keep saying it worked.
      source.write(next).catch(() => {}).then(() => source.read()).then((on) => setExternal(Boolean(on)), () => {});
    };
    return <Switch label={row.label} on={external} onFlip={flip} />;
  }
  return <Switch label={row.label} on={Boolean(saved)} onFlip={() => save(!saved)} />;
}

function SliderRow({ row }: { row: Extract<RowDef, { kind: "slider" }> }) {
  const [value, save] = useValue<number>(row.key);
  return (
    <div className="slider">
      <input type="range" aria-label={row.label} min={row.min} max={row.max} value={value} onChange={(e) => save(Number(e.target.value))} />
      <div className="slider__marks">
        {Object.entries(row.marks).map(([name, mark]) => (
          <button key={name} type="button" aria-label={name} className={value === mark ? "mark mark--on" : "mark"} onClick={() => save(mark)}>
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChoiceRow({ row }: { row: Extract<RowDef, { kind: "choice" }> }) {
  const [value, save] = useValue<string>(row.key);
  return (
    <div className="segments" role="radiogroup" aria-label={row.label}>
      {row.options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={value === option.value ? "segment segment--on" : "segment"}
          onClick={() => {
            save(option.value);
            row.onChange?.(option.value as never);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TextRow({ row }: { row: Extract<RowDef, { kind: "text" }> }) {
  const [saved, save] = useValue<string>(row.key);
  const [draft, setDraft] = useState(saved ?? "");
  useEffect(() => setDraft(saved ?? ""), [saved]);
  const commit = () => {
    if (draft.trim() !== saved) save(draft.trim());
  };
  return (
    <input
      className="field"
      aria-label={row.label}
      placeholder={row.placeholder}
      spellCheck={false}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

function AccentRow({ row }: { row: RowDef }) {
  const [value, save] = useValue<string | null>(row.key);
  const current = value ?? ACCENTS[0].color;
  return (
    <div className="accents" role="radiogroup" aria-label={row.label}>
      {ACCENTS.map((accent) => (
        <button
          key={accent.name}
          type="button"
          role="radio"
          aria-label={accent.name}
          aria-checked={current === accent.color}
          className={current === accent.color ? "accent accent--on" : "accent"}
          style={{ background: accent.color }}
          onClick={() => save(accent.color)}
        />
      ))}
      <label className="accent accent--own" title="Your own colour" style={{ background: ACCENTS.some((a) => a.color === current) ? undefined : current }}>
        <input type="color" aria-label="Your own colour" value={current} onChange={(e) => save(e.target.value)} />
      </label>
    </div>
  );
}

interface Screen {
  id: string;
  name: string;
  primary: boolean;
}

/** Windows' screens, read again whenever they change. */
function ScreenRow({ row }: { row: Extract<RowDef, { kind: "screen" }> }) {
  const [value, save] = useValue<string | null>(row.key);
  const [screens, setScreens] = useState<Screen[]>([]);
  useEffect(() => {
    const read = () => invoke<Screen[] | null>("displays_list").then((list) => setScreens(list ?? []), () => {});
    read();
    const off = listen("displays-changed", read);
    return () => void off.then((stop) => stop());
  }, []);
  const current = value ?? screens.find((s) => s.primary)?.id ?? "";
  // A chosen screen that's unplugged stays chosen, so the dock goes back when it returns.
  const away = value !== null && screens.length > 0 && !screens.some((s) => s.id === value);
  return (
    <select
      className="field"
      aria-label={row.label}
      value={current}
      onChange={(e) => {
        save(e.target.value);
        row.onChange?.(e.target.value as never);
      }}
    >
      {screens.map((s) => (
        <option key={s.id} value={s.id}>
          {s.primary ? `${s.name} (main)` : s.name}
        </option>
      ))}
      {away && <option value={value}>Unplugged screen</option>}
    </select>
  );
}

function VersionRow() {
  const [version, setVersion] = useState("");
  useEffect(() => {
    appVersion().then(setVersion, () => {});
  }, []);
  return <span className="version">{version}</span>;
}

/** A picture of the owner's, made small here and kept in Shelf's own storage. */
function ImageRow({ row }: { row: RowDef }) {
  const input = useRef<HTMLInputElement>(null);
  const choose = (file: File | undefined) => {
    if (file) shrinkImage(file).then(saveStartImage, () => {});
  };
  return (
    <span className="image-row">
      <input ref={input} type="file" accept="image/*" hidden aria-label={row.label} onChange={(e) => choose(e.target.files?.[0])} />
      <button type="button" className="field-button" onClick={() => input.current?.click()}>
        Choose…
      </button>
      <button type="button" className="field-button" onClick={() => void saveStartImage(null)}>
        Use logo
      </button>
    </span>
  );
}

function Control({ row }: { row: RowDef }) {
  switch (row.kind) {
    case "image":
      return <ImageRow row={row} />;
    case "toggle":
      return <ToggleRow row={row} />;
    case "slider":
      return <SliderRow row={row} />;
    case "choice":
      return <ChoiceRow row={row} />;
    case "text":
      return <TextRow row={row} />;
    case "accent":
      return <AccentRow row={row} />;
    case "screen":
      return <ScreenRow row={row} />;
    case "version":
      return <VersionRow />;
    case "action":
      return null;
  }
}

/** A fieldset turns off every control inside it at once. */
function Usable({ row, children }: { row: RowDef; children: ReactNode }) {
  const off = useSettings((s) => row.disabledWhen?.(s) ?? false);
  if (!row.disabledWhen) return <>{children}</>;
  return (
    <fieldset className="setting__control" disabled={off}>
      {children}
    </fieldset>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <span className="tip" role="img" aria-label={text} title={text}>
      i
    </span>
  );
}

function Row({ row }: { row: RowDef }) {
  if (row.kind === "action") {
    return (
      <div className="setting setting--action">
        <button type="button" className={row.danger ? "action action--danger" : "action"} onClick={row.run}>
          {row.label}
        </button>
        <Tip text={row.tip} />
      </div>
    );
  }
  return (
    <div className="setting">
      <span className="setting__label">
        {row.label}
        <Tip text={row.tip} />
      </span>
      <Usable row={row}>
        <Control row={row} />
      </Usable>
    </div>
  );
}

export function Section({ section }: { section: SectionDef }) {
  return (
    <section className="group">
      {section.title && <h2 className="group__title">{section.title}</h2>}
      <div className="group__rows">
        {section.rows.map((row) => (
          <Row key={row.key} row={row} />
        ))}
      </div>
    </section>
  );
}

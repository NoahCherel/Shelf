import { useEffect, useState } from "react";
import { invoke } from "../../core/tauri";

/** An app's icon in a menu or a card, or its first letter until the icon comes. */
export function AppIcon({ appKey, name, className, blankClassName = "amenu__blank" }: { appKey: string; name: string; className?: string; blankClassName?: string }) {
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
  if (src) return <img className={className} src={src} alt="" draggable={false} />;
  return <span className={blankClassName} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>;
}

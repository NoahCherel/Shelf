import { useState } from "react";
import { AppMenu } from "./AppMenu";
import { GroupCard } from "./GroupCard";

type Shown = { menu: string } | { group: string };

/**
 * An app's menu or a group's card, in one card window. Opening a group from its menu shows its apps,
 * and right-clicking one of them shows that app's menu, without the card closing in between.
 */
export function DockMenu({ start }: { start: Shown }) {
  const [shown, setShown] = useState<Shown>(start);
  if ("group" in shown) return <GroupCard groupKey={shown.group} onMenu={(key) => setShown({ menu: key })} />;
  const key = shown.menu;
  return <AppMenu key={key} appKey={key} onOpenGroup={() => setShown({ group: key })} />;
}

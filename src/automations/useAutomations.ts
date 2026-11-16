import { useEffect, useState } from "react";
import { useLayout } from "../core/layout";
import { STORE } from "../core/names";
import { useSettings } from "../core/settings";
import { invoke } from "../core/tauri";
import { showToast } from "../core/toast";
import { useProvider } from "../core/useProvider";
import { windowLabel } from "../core/windowLabel";
import { claudeProvider } from "../providers/claude";
import { limitAlerts, limitToast, type Warned } from "./aiLimits";

/** The Claude widget whose card a limit toast opens: the full one first. */
function claudeOnDock(): string | null {
  const ids = useLayout.getState().ids;
  return ["claude-usage", "claude-plan-usage"].find((id) => ids.includes(id)) ?? null;
}

/**
 * The automations, run by the main dock only. What was warned about is kept in the store, so a
 * restart doesn't warn again about the same limit.
 */
export function useAutomations(): void {
  const main = windowLabel() === "dock";
  const aiLimits = useSettings((s) => s.automations.aiLimits) && main;
  const { data, status } = useProvider(aiLimits ? claudeProvider : undefined);
  const [warned, setWarned] = useState<Warned | null>(null);

  useEffect(() => {
    if (!aiLimits) return;
    let live = true;
    invoke<Warned | null>("store_load", { name: STORE.automations }).then(
      (saved) => live && setWarned(saved ?? {}),
      () => live && setWarned({}),
    );
    return () => {
      live = false;
    };
  }, [aiLimits]);

  useEffect(() => {
    if (!aiLimits || status !== "ready" || !data || warned === null) return;
    const now = Date.now();
    const out = limitAlerts(data, warned, now);
    if (out.alerts.length === 0) return;
    const details = claudeOnDock();
    for (const alert of out.alerts) showToast(limitToast(alert, now, details));
    setWarned(out.warned);
    invoke("store_save", { name: STORE.automations, value: out.warned }).catch(() => {});
  }, [aiLimits, status, data, warned]);
}

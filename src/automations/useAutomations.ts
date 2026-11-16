import { useEffect, useRef, useState } from "react";
import { useLayout } from "../core/layout";
import { STORE } from "../core/names";
import { useSettings } from "../core/settings";
import { invoke, listen } from "../core/tauri";
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

const LIMIT_TOAST = /^ai-limit-(session|weekly)$/;

/**
 * The automations, run by the main dock only. A warning counts as given once its toast has shown:
 * then it's kept in the store, so a restart doesn't warn again. One still held by quiet hours or a
 * game is only remembered here, so it comes back if Shelf stops before it could show.
 */
export function useAutomations(): void {
  const main = windowLabel() === "dock";
  const aiLimits = useSettings((s) => s.automations.aiLimits) && main;
  const { data, status } = useProvider(aiLimits ? claudeProvider : undefined);
  const [warned, setWarned] = useState<Warned | null>(null);
  /** Sent, not shown yet. */
  const pending = useRef<Warned>({});

  useEffect(() => {
    if (!aiLimits) return;
    let live = true;
    invoke<Warned | null>("store_load", { name: STORE.automations }).then(
      (saved) => live && setWarned(saved ?? {}),
      () => live && setWarned({}),
    );
    const off = listen<string>("toast-shown", (id) => {
      const name = LIMIT_TOAST.exec(id)?.[1] as keyof Warned | undefined;
      const given = name && pending.current[name];
      if (!name || !given) return;
      delete pending.current[name];
      setWarned((now) => {
        const next = { ...now, [name]: given };
        invoke("store_save", { name: STORE.automations, value: next }).catch(() => {});
        return next;
      });
    });
    return () => {
      live = false;
      void off.then((f) => f());
    };
  }, [aiLimits]);

  useEffect(() => {
    if (!aiLimits || status !== "ready" || !data || warned === null) return;
    const now = Date.now();
    // What waits to show counts too, or each reading would send it again.
    const out = limitAlerts(data, { ...warned, ...pending.current }, now);
    if (out.alerts.length === 0) return;
    const details = claudeOnDock();
    for (const alert of out.alerts) {
      pending.current[alert.window] = out.warned[alert.window];
      showToast(limitToast(alert, now, details));
    }
  }, [aiLimits, status, data, warned]);
}

import { useEffect, useRef, useState } from "react";
import { useLayout } from "../core/layout";
import { STORE } from "../core/names";
import { useSettings } from "../core/settings";
import { invoke, listen } from "../core/tauri";
import { showToast } from "../core/toast";
import { useProvider } from "../core/useProvider";
import { windowLabel } from "../core/windowLabel";
import { chatgptProvider } from "../providers/chatgpt";
import { claudeProvider } from "../providers/claude";
import { cursorProvider } from "../providers/cursor";
import { geminiProvider } from "../providers/gemini";
import { glmProvider } from "../providers/glm";
import { grokProvider } from "../providers/grok";
import { limitAlerts, limitToast, providerLimitAlerts, providerLimitToast, type Warned } from "./aiLimits";

/** The Claude widget whose card a limit toast opens: the full one first. */
function claudeOnDock(): string | null {
  const ids = useLayout.getState().ids;
  return ["claude-usage", "claude-plan-usage"].find((id) => ids.includes(id)) ?? null;
}

const LIMIT_TOAST = /^ai-limit-(.+)$/;

/**
 * The automations, run by the main dock only. A warning counts as given once its toast has shown:
 * then it's kept in the store, so a restart doesn't warn again. One still held by quiet hours or a
 * game is only remembered here, so it comes back if Shelf stops before it could show.
 */
export function useAutomations(): void {
  const main = windowLabel() === "dock";
  const aiLimits = useSettings((s) => s.automations.aiLimits) && main;
  const dockIds = useLayout((s) => s.ids);
  const hasChatGpt = dockIds.includes("chatgpt-usage");
  const hasGemini = dockIds.includes("gemini-usage");
  const hasGrok = dockIds.includes("grok-usage");
  const hasGlm = dockIds.includes("glm-usage");
  const hasCursor = dockIds.includes("cursor-usage");

  const { data, status } = useProvider(aiLimits ? claudeProvider : undefined);
  const chatgpt = useProvider(aiLimits && hasChatGpt ? chatgptProvider : undefined);
  const gemini = useProvider(aiLimits && hasGemini ? geminiProvider : undefined);
  const grok = useProvider(aiLimits && hasGrok ? grokProvider : undefined);
  const glm = useProvider(aiLimits && hasGlm ? glmProvider : undefined);
  const cursor = useProvider(aiLimits && hasCursor ? cursorProvider : undefined);
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
      const name = LIMIT_TOAST.exec(id)?.[1];
      const given = name ? pending.current[name] : undefined;
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

  useEffect(() => {
    if (!aiLimits || !hasChatGpt || chatgpt.status !== "ready" || !chatgpt.data || warned === null) return;
    const now = Date.now();
    const out = providerLimitAlerts(
      "ChatGPT",
      [
        { key: "chatgpt-session", label: "session", win: chatgpt.data.session },
        { key: "chatgpt-weekly", label: "weekly limit", win: chatgpt.data.weekly, dayReset: true },
      ],
      { ...warned, ...pending.current },
      now,
    );
    for (const alert of out.alerts) {
      pending.current[alert.key] = out.warned[alert.key];
      showToast(providerLimitToast(alert, now, "chatgpt-usage"));
    }
  }, [aiLimits, hasChatGpt, chatgpt.status, chatgpt.data, warned]);

  useEffect(() => {
    if (!aiLimits || !hasGemini || gemini.status !== "ready" || !gemini.data || warned === null) return;
    const now = Date.now();
    const out = providerLimitAlerts(
      "Antigravity",
      [
        { key: "gemini-session", label: "session", win: gemini.data.session },
        { key: "gemini-weekly", label: "weekly limit", win: gemini.data.weekly, dayReset: true },
      ],
      { ...warned, ...pending.current },
      now,
    );
    for (const alert of out.alerts) {
      pending.current[alert.key] = out.warned[alert.key];
      showToast(providerLimitToast(alert, now, "gemini-usage"));
    }
  }, [aiLimits, hasGemini, gemini.status, gemini.data, warned]);

  useEffect(() => {
    if (!aiLimits || !hasGrok || grok.status !== "ready" || !grok.data || warned === null) return;
    const now = Date.now();
    const out = providerLimitAlerts(
      "Grok",
      [{ key: "grok-credits", label: "credits", win: grok.data.credits, dayReset: true }],
      { ...warned, ...pending.current },
      now,
    );
    for (const alert of out.alerts) {
      pending.current[alert.key] = out.warned[alert.key];
      showToast(providerLimitToast(alert, now, "grok-usage"));
    }
  }, [aiLimits, hasGrok, grok.status, grok.data, warned]);

  useEffect(() => {
    if (!aiLimits || !hasGlm || glm.status !== "ready" || !glm.data || warned === null) return;
    const now = Date.now();
    const out = providerLimitAlerts(
      "GLM",
      [
        { key: "glm-session", label: "session", win: glm.data.session },
        { key: "glm-weekly", label: "weekly limit", win: glm.data.weekly, dayReset: true },
        { key: "glm-mcp", label: "MCP limit", win: glm.data.mcp, dayReset: true },
      ],
      { ...warned, ...pending.current },
      now,
    );
    for (const alert of out.alerts) {
      pending.current[alert.key] = out.warned[alert.key];
      showToast(providerLimitToast(alert, now, "glm-usage"));
    }
  }, [aiLimits, hasGlm, glm.status, glm.data, warned]);

  useEffect(() => {
    if (!aiLimits || !hasCursor || cursor.status !== "ready" || !cursor.data || warned === null) return;
    const now = Date.now();
    const out = providerLimitAlerts(
      "Cursor",
      [
        { key: "cursor-auto", label: "Auto limit", win: cursor.data.auto, dayReset: true },
        { key: "cursor-api", label: "API limit", win: cursor.data.api, dayReset: true },
      ],
      { ...warned, ...pending.current },
      now,
    );
    for (const alert of out.alerts) {
      pending.current[alert.key] = out.warned[alert.key];
      showToast(providerLimitToast(alert, now, "cursor-usage"));
    }
  }, [aiLimits, hasCursor, cursor.status, cursor.data, warned]);
}

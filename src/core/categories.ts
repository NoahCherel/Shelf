import type { Category } from "./widget";

/** Picker order, names and colours. */
export const CATEGORIES: { id: Category; label: string; color: string }[] = [
  { id: "clocks", label: "Clocks", color: "#ff9f0a" },
  { id: "productivity", label: "Productivity", color: "#30d158" },
  { id: "system", label: "System", color: "#8e8e93" },
  { id: "apps-files", label: "Apps & Files", color: "#0a84ff" },
  { id: "media-audio", label: "Media & Audio", color: "#ff375f" },
  { id: "ai", label: "AI", color: "#d77655" },
  { id: "analytics", label: "Analytics", color: "#5e5ce6" },
  { id: "social", label: "Social", color: "#64d2ff" },
  { id: "stocks", label: "Stocks", color: "#32d74b" },
  { id: "finance", label: "Finance", color: "#635aff" },
  { id: "weather", label: "Weather", color: "#5ac8fa" },
  { id: "online-mail", label: "Online & Mail", color: "#bf5af2" },
  { id: "developer", label: "Developer", color: "#ac8e68" },
];

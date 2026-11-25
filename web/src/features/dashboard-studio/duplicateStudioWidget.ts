import { type DashboardDefinition } from "@langfuse/shared";

type Widget = Extract<
  DashboardDefinition["widgets"][number],
  { type: "query" | "text" }
>;

/** A duplicate is an independent widget, including when its source is a report comparison. */
export function duplicateStudioWidget(widget: Widget): Widget {
  const copy = structuredClone(widget);
  copy.id = crypto.randomUUID();
  const copyTitle = (title: string) => `${title.slice(0, 193)} (copy)`;
  if (copy.type === "text") {
    copy.title = copyTitle(copy.title || "Markdown");
    return copy;
  }
  delete copy.compareWith;
  copy.config.title = copyTitle(copy.config.title);
  if (copy.config.version === 2 && copy.config.tabs.length === 1)
    copy.config.tabs[0]!.chart.title = copy.config.title;
  return copy;
}

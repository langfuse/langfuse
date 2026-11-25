import type { StudioWidgetConfig } from "../../../src/domain/dashboard-studio";
import type { DashboardDefinition } from "../../../src/server/services/DashboardService/types";

/** The notebook and grid use the same placements. H1 Markdown cells start a chapter. */
export function createNotebook() {
  const widgets: DashboardDefinition["widgets"] = [];
  let y = 0;
  const geometry = (height: number) => {
    const top = y;
    y += height;
    return { x: 0, y: top, x_size: 12, y_size: height };
  };
  const note = (id: string, title: string, content: string) =>
    widgets.push({ type: "text", id, title, content, ...geometry(3) });
  const chapter = (id: string, title: string, intro: string) =>
    note(id, "", `# ${title}\n\n${intro}`);
  const chart = (id: string, config: StudioWidgetConfig) =>
    widgets.push({ type: "query", id, config, ...geometry(7) });
  return { widgets, geometry, note, chapter, chart };
}

export function notebookExample(
  definition: DashboardDefinition,
  id: string,
): StudioWidgetConfig {
  const cell = definition.widgets.find((w) => w.id === id);
  if (cell?.type !== "query" || cell.config.version !== 1)
    throw new Error(`Missing dashboard example ${id}`);
  return cell.config;
}

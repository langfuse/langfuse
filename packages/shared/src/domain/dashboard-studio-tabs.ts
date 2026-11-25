import { z } from "zod";
import { StudioWidgetConfigSchema } from "./dashboard-studio";

const tabSchema = z.object({
  id: z.string().min(1).max(100),
  chart: StudioWidgetConfigSchema.refine(
    (chart) => !chart.display.activeQueryIds?.length,
    {
      message: "A chart tab contains its own selection of series.",
    },
  ),
});

export const StudioTabbedWidgetSchema = z
  .object({
    version: z.literal(2),
    title: z.string().min(1).max(200),
    tabs: z.array(tabSchema).min(1).max(16),
  })
  .refine(
    (widget) =>
      new Set(widget.tabs.map((tab) => tab.id)).size === widget.tabs.length,
    {
      message: "Chart tab IDs must be unique.",
    },
  );

export const StudioSavedWidgetConfigSchema = z.union([
  StudioTabbedWidgetSchema,
  StudioWidgetConfigSchema,
]);
export type StudioSavedWidgetConfig = z.infer<
  typeof StudioSavedWidgetConfigSchema
>;
export type StudioTabbedWidget = z.infer<typeof StudioTabbedWidgetSchema>;

/** Convert explicitly switchable legacy views; independent series in one chart stay together. */
export function normalizeStudioWidget(
  saved: StudioSavedWidgetConfig,
): StudioTabbedWidget {
  if (saved.version === 2) return saved;
  const { activeQueryIds, ...display } = saved.display;
  const visible = saved.queries.filter((query) => !query.hidden);
  if (!activeQueryIds?.length || visible.length < 2) {
    return {
      version: 2,
      title: saved.title,
      tabs: [{ id: "main", chart: { ...saved, display } }],
    };
  }
  const groups = [
    activeQueryIds,
    ...visible
      .filter((query) => !activeQueryIds.includes(query.id))
      .map((query) => [query.id]),
  ];
  return {
    version: 2,
    title: saved.title,
    tabs: groups.map((ids, index) => {
      const selected = saved.queries.filter((query) => ids.includes(query.id));
      // Formula references are stable IDs, including references to hidden operands.
      const queries = saved.queries.flatMap((query) => {
        if (ids.includes(query.id)) return [query];
        if (saved.expressions.length || (index === 0 && query.hidden))
          return [{ ...query, hidden: true }];
        return [];
      });
      const headlineMetricRef = queries.some((query) =>
        query.metrics.some(
          (metric) => display.headlineMetricRef === query.id + "." + metric.id,
        ),
      )
        ? display.headlineMetricRef
        : undefined;
      return {
        id: "view-" + index,
        chart: {
          ...saved,
          title: selected
            .map((q) => q.label || q.id)
            .join(" + ")
            .slice(0, 200),
          queries,
          display: { ...display, headlineMetricRef },
        },
      };
    }),
  };
}

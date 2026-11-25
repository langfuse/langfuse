import { useState } from "react";
import { type FilterState } from "@langfuse/shared";
import {
  multiQueryTabAsChart,
  type MultiQueryTab,
} from "@langfuse/shared/dashboards";
import { applyMultiQueryFormulas } from "./multiQueryFormulas";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { buildMultiQueryPlan, type MultiQueryPlan } from "./multiQueryModel";
import { useMultiQueryResults } from "./useMultiQueryResults";

const noHiddenSeries: ReadonlySet<string> = new Set();

export type MultiQueryWidgetContext = {
  projectId: string;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  readPath: ResolvedReadPath;
};

export function useMultiQueryWidget(
  tab: MultiQueryTab,
  context: MultiQueryWidgetContext,
  enabled: boolean,
) {
  const [fallbackRange] = useState(() => ({
    from: new Date(Date.now() - 7 * 86400_000),
    to: new Date(),
  }));
  const dateRange = context.dateRange ?? fallbackRange;
  const [refreshKey, setRefreshKey] = useState(0);
  const [hiddenByTab, setHiddenByTab] = useState<
    Record<string, ReadonlySet<string>>
  >({});
  const config = multiQueryTabAsChart(tab);
  let plan: MultiQueryPlan | undefined;
  let validationError: string | null = null;
  try {
    plan = buildMultiQueryPlan(config, { ...context, dateRange });
  } catch (error) {
    validationError =
      error instanceof Error ? error.message : "Check the chart configuration";
  }
  const rawResult = useMultiQueryResults(plan, {
    projectId: context.projectId,
    readPath: context.readPath,
    refreshKey,
    enabled: enabled && !validationError,
  });
  const result = applyMultiQueryFormulas(tab, rawResult, context.readPath);
  const hasVisibleMetrics =
    tab.queries.some(
      (source) =>
        !source.hidden && source.metrics.some((metric) => !metric.hidden),
    ) || Boolean(tab.formulas?.some((formula) => !formula.hidden));
  return {
    hiddenSeries: hiddenByTab[tab.id] ?? noHiddenSeries,
    toggleSeries: (id: string) => {
      setHiddenByTab((previous) => {
        const next = new Set(previous[tab.id]);
        if (!next.delete(id)) next.add(id);
        return { ...previous, [tab.id]: next };
      });
    },
    hasVisibleMetrics,
    isV4: context.readPath === "v4",
    dateRange,
    plan,
    validationError,
    result,
    config,
    refresh: () => setRefreshKey((key) => key + 1),
  };
}

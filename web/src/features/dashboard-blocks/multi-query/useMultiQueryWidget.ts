import { useState } from "react";
import { type FilterState, type MultiQueryConfig } from "@langfuse/shared";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import {
  buildMultiQueryPlan,
  resolveMultiQueryView,
  type MultiQueryPlan,
} from "./multiQueryModel";
import { useMultiQueryResults } from "./useMultiQueryResults";

export type MultiQueryWidgetContext = {
  projectId: string;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  readPath: ResolvedReadPath;
};

export function useMultiQueryWidget(
  config: MultiQueryConfig,
  context: MultiQueryWidgetContext,
  enabled: boolean,
) {
  const [fallbackRange] = useState(() => ({
    from: new Date(Date.now() - 7 * 86400_000),
    to: new Date(),
  }));
  const [selectedView, selectView] = useState<string>();
  const [refreshKey, setRefreshKey] = useState(0);
  const view = resolveMultiQueryView(config, selectedView);
  const active = {
    ...config,
    queries: config.queries.filter((query) => view.queryIds.includes(query.id)),
    views: undefined,
    defaultViewId: undefined,
  };
  let plan: MultiQueryPlan | undefined;
  let validationError: string | null = null;
  try {
    plan = buildMultiQueryPlan(
      config,
      { ...context, dateRange: context.dateRange ?? fallbackRange },
      view.queryIds,
    );
  } catch (error) {
    validationError =
      error instanceof Error ? error.message : "Check the chart configuration";
  }
  const result = useMultiQueryResults(plan, {
    projectId: context.projectId,
    readPath: context.readPath,
    refreshKey,
    enabled: enabled && !validationError,
  });
  return {
    plan,
    validationError,
    result,
    config: active,
    viewId: view.viewId,
    selectView,
    refresh: () => setRefreshKey((key) => key + 1),
  };
}

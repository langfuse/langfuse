import { useEffect, useId, useState } from "react";
import { hashKey } from "@tanstack/react-query";
import { type FilterState, type StudioWidgetConfig } from "@langfuse/shared";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { api } from "@/src/utils/api";
import {
  useDashboardQuerySlot,
  getDashboardQueryCachePolicy,
} from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { resolveStudioQueryVersion } from "./studioConfig";
import { toStudioQueryConfig } from "./studioQueryConfig";
import { useCurrentStudioResult } from "./useCurrentStudioResult";

type StudioWidgetQueryContext = {
  projectId: string;
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
  enabled?: boolean;
};

/** One shared execution owner for cards and the editor; results remain in React Query. */
export function useStudioWidgetResult(
  lastRunConfig: StudioWidgetConfig,
  context: StudioWidgetQueryContext,
) {
  const queryId = useId();
  const [fallbackRange] = useState(() => ({
    from: new Date(Date.now() - 7 * 86400000),
    to: new Date(),
  }));
  const range = context.dateRange ?? fallbackRange;
  const version = resolveStudioQueryVersion(
    lastRunConfig,
    context.readPath === "v4" ? "v2" : "v1",
    context.filterState,
  );
  const input = {
    projectId: context.projectId,
    config: toStudioQueryConfig(lastRunConfig),
    version,
    fromTimestamp: range.from.toISOString(),
    toTimestamp: range.to.toISOString(),
    granularity: "auto" as const,
    filters: context.filterState,
  };
  const cachePolicy = getDashboardQueryCachePolicy(input);
  const currentMode = lastRunConfig.executionMode === "current";
  const slot = useDashboardQuerySlot({
    queryId,
    runKey: hashKey([input]),
    enabled: context.enabled !== false,
  });
  const prototype = api.dashboardStudio.execute.useQuery(input, {
    ...cachePolicy,
    enabled: slot.canFetch && !currentMode && context.enabled !== false,
    refetchOnWindowFocus: false,
    retry: false,
    meta: { silentHttpCodes: [400, 412, 422] },
    trpc: { abortOnUnmount: true },
  });
  const current = useCurrentStudioResult(
    input.config,
    {
      projectId: context.projectId,
      version,
      fromTimestamp: input.fromTimestamp,
      toTimestamp: input.toTimestamp,
      filters: context.filterState,
    },
    currentMode && context.enabled !== false,
    slot.canFetch && context.enabled !== false,
  );
  const result = currentMode ? current : prototype;
  // A completed network request releases its external scheduler slot.
  useEffect(() => {
    if (slot.canFetch && result.fetchStatus === "idle" && !result.isPending)
      slot.markDone();
  }, [result.fetchStatus, result.isPending, slot]);
  return { result, version };
}

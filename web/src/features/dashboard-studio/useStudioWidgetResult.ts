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

type StudioWidgetQueryContext = {
  projectId: string;
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date } | undefined;
  filterState: FilterState;
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
  const slot = useDashboardQuerySlot({
    queryId,
    runKey: hashKey([input]),
    enabled: true,
  });
  const result = api.dashboardStudio.execute.useQuery(input, {
    ...cachePolicy,
    enabled: slot.canFetch,
    refetchOnWindowFocus: false,
    retry: false,
    meta: { silentHttpCodes: [400, 412, 422] },
    trpc: { abortOnUnmount: true },
  });
  // A completed network request releases its external scheduler slot.
  useEffect(() => {
    if (slot.canFetch && result.fetchStatus === "idle" && !result.isPending)
      slot.markDone();
  }, [result.fetchStatus, result.isPending, slot]);
  return { result, version };
}

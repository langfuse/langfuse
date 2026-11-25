import { useEffect, useId, useMemo, useState } from "react";
import { hashKey } from "@tanstack/react-query";
import { type FilterState, type StudioWidgetConfig } from "@langfuse/shared";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { api } from "@/src/utils/api";
import {
  useDashboardQuerySlot,
  getDashboardQueryCachePolicy,
} from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { resolveStudioQueryVersion } from "./studioConfig";
import {
  applyStudioExpressions,
  prepareStudioExpressions,
} from "./currentStudioExecution";
import {
  toStudioQueryConfig,
  toStudioSourceRequest,
} from "./studioQueryConfig";
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
  const currentMode = lastRunConfig.executionMode === "current";
  const experimental = useMemo(() => {
    if (currentMode || !lastRunConfig.expressions.length) return {};
    try {
      return { plan: prepareStudioExpressions(lastRunConfig, version) };
    } catch (cause) {
      return {
        error: cause instanceof Error ? cause : new Error("Invalid formula"),
      };
    }
  }, [currentMode, lastRunConfig, version]);
  const chart = toStudioQueryConfig(lastRunConfig);
  const input = {
    projectId: context.projectId,
    config: toStudioSourceRequest(chart, experimental.plan?.required),
    version,
    fromTimestamp: range.from.toISOString(),
    toTimestamp: range.to.toISOString(),
    granularity: "auto" as const,
    filters: context.filterState,
  };
  const cachePolicy = getDashboardQueryCachePolicy(input);
  const slot = useDashboardQuerySlot({
    queryId,
    runKey: hashKey([
      input,
      currentMode && chart.display.activeQueryIds
        ? chart.expressions
        : undefined,
    ]),
    enabled: context.enabled !== false && !experimental.error,
  });
  const prototype = api.dashboardStudio.execute.useQuery(input, {
    ...cachePolicy,
    enabled:
      slot.canFetch &&
      !currentMode &&
      context.enabled !== false &&
      !experimental.error,
    refetchOnWindowFocus: false,
    retry: false,
    meta: { silentHttpCodes: [400, 412, 422] },
    trpc: { abortOnUnmount: true },
  });
  const current = useCurrentStudioResult(
    chart,
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
  const calculated = useMemo(() => {
    if (experimental.error) return { error: experimental.error };
    if (!prototype.data || !experimental.plan) return { data: prototype.data };
    try {
      return {
        data: applyStudioExpressions(experimental.plan, prototype.data),
      };
    } catch (cause) {
      return {
        error:
          cause instanceof Error
            ? cause
            : new Error("Formula evaluation failed"),
      };
    }
  }, [prototype.data, experimental]);
  const result = currentMode
    ? current
    : {
        ...prototype,
        data: calculated.data,
        error: calculated.error ?? prototype.error,
        isError: Boolean(calculated.error) || prototype.isError,
        isPending: !calculated.error && prototype.isPending,
      };
  // A completed network request releases its external scheduler slot.
  useEffect(() => {
    if (slot.canFetch && result.fetchStatus === "idle" && !result.isPending)
      slot.markDone();
  }, [result.fetchStatus, result.isPending, slot]);
  return { result, version };
}

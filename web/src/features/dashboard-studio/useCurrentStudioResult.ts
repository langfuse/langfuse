import { api } from "@/src/utils/api";
import { getDashboardQueryCachePolicy } from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { type StudioWidgetConfig } from "@langfuse/shared";
import {
  createCurrentStudioPlan,
  normalizeCurrentStudioResults,
  type CurrentStudioPlan,
} from "./currentStudioExecution";

export function useCurrentStudioResult(
  config: StudioWidgetConfig,
  context: Parameters<typeof createCurrentStudioPlan>[1] & {
    projectId: string;
  },
  active: boolean,
  enabled: boolean,
) {
  let plan: CurrentStudioPlan | undefined;
  let error: Error | null = null;
  if (active) {
    try {
      plan = createCurrentStudioPlan(config, context);
    } catch (cause) {
      error = new Error(
        cause instanceof Error
          ? cause.message
          : "This query is not supported in current mode.",
      );
    }
  }
  const queries = api.useQueries((t) =>
    (plan?.requests ?? []).map((request) =>
      t.dashboard.executeQuery(
        {
          projectId: context.projectId,
          version: context.version,
          query: request.query,
        },
        {
          ...getDashboardQueryCachePolicy(request.query),
          enabled,
          retry: false,
          refetchOnWindowFocus: false,
          meta: { silentHttpCodes: [400, 412, 422] },
          trpc: { abortOnUnmount: true },
        },
      ),
    ),
  );
  const isPending =
    active &&
    !error &&
    (queries.some((query) => query.isPending) || !plan?.requests.length);
  const fetchStatus = queries.some((query) => query.fetchStatus === "fetching")
    ? "fetching"
    : "idle";
  let data;
  if (plan && !isPending) {
    try {
      data = normalizeCurrentStudioResults(
        plan,
        queries.map((query) => ({ rows: query.data, error: query.error })),
      );
    } catch (cause) {
      error = new Error(
        cause instanceof Error
          ? cause.message
          : "The production results could not be combined.",
      );
    }
  }
  return {
    data,
    error,
    isPending,
    isError: Boolean(error),
    isFetching: fetchStatus === "fetching",
    fetchStatus: fetchStatus as "idle" | "fetching" | "paused",
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  };
}

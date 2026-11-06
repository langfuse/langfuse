import { StringParam, useQueryParams } from "use-query-params";
import { type AgentScope } from "@langfuse/shared/agents";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { type OutlierStripDrillTrigger } from "@/src/features/events/components/outlier-strip/OutlierBarStrip";

type AgentActivitySurface =
  | "agents"
  | "agent_sessions"
  | "agent_invocations"
  | "agent_traces"
  | "agent_tools"
  | "agent_skills";

export function useAgentActivityDrill(
  scope: Pick<AgentScope, "projectId" | "from" | "to">,
  surface: AgentActivitySurface,
) {
  const capture = usePostHogClientCapture();
  const { setTimeRange } = useTableDateRange(scope.projectId, {
    persistAsDefault: false,
  });
  const [, setPagination] = useQueryParams({
    page: StringParam,
    pageIndex: StringParam,
    skillPage: StringParam,
  });

  return (
    range: { from: Date; to: Date },
    meta: {
      trigger: OutlierStripDrillTrigger;
      stepSeconds: number;
      spanBuckets: number;
    },
  ) => {
    if (
      range.from.getTime() === scope.from.getTime() &&
      range.to.getTime() === scope.to.getTime()
    )
      return;

    capture("pulse:drill_in", {
      surface,
      trigger: meta.trigger,
      metric: "count",
      aggregation: "count",
      mode: "count",
      stepSeconds: meta.stepSeconds,
      spanBuckets: meta.spanBuckets,
      isV4: true,
    });
    setTimeRange(range);
    setPagination({
      page: undefined,
      pageIndex: undefined,
      skillPage: undefined,
    });
  };
}

import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { StringParam, useQueryParams } from "use-query-params";
import {
  AgentEnvironmentFilterListSchema,
  type AgentScope,
} from "@langfuse/shared/agents";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { type TimeRange } from "@/src/utils/date-range-utils";
import { agentEnvironmentFilters, agentWindow } from "./agentsQuery";

export function useAgentsScope(projectId: string) {
  const router = useRouter();
  const [anchor, setAnchor] = useState(() => Date.now());
  const { timeRange, setTimeRange: setSharedTimeRange } =
    useTableDateRange(projectId);
  const [, setScopeParams] = useQueryParams({
    filter: StringParam,
    page: StringParam,
    pageIndex: StringParam,
    skillPage: StringParam,
  });
  const { window, error: windowError } = agentWindow(timeRange, anchor);
  const environments = useMemo(
    () =>
      AgentEnvironmentFilterListSchema.safeParse(
        agentEnvironmentFilters(router.query.filter),
      ),
    [router.query.filter],
  );
  const error =
    windowError ??
    (environments.success
      ? null
      : "Choose supported environment filters (up to 20 conditions).");
  const scope: AgentScope = {
    projectId,
    ...window,
    environment: null,
    environmentFilter: environments.success ? environments.data : [],
  };
  return {
    scope,
    error,
    enabled: !error && router.isReady,
    hasInvalidFilters: !environments.success,
    clearFilters: () =>
      setScopeParams({
        filter: "",
        page: undefined,
        pageIndex: undefined,
        skillPage: undefined,
      }),
    timeRange,
    setTimeRange: (range: TimeRange) => {
      setAnchor(Date.now());
      setSharedTimeRange(range);
      setScopeParams({
        page: undefined,
        pageIndex: undefined,
        skillPage: undefined,
      });
    },
    refreshWindow: () => {
      if (!("range" in timeRange)) return false;
      setAnchor(Date.now());
      return true;
    },
  };
}

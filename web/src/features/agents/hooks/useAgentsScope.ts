import { useState } from "react";
import { useRouter } from "next/router";
import { type AgentScope } from "@langfuse/shared/agents";
import {
  toAbsoluteTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";
import { agentWindow } from "./agentsQuery";

export function useAgentsScope(projectId: string) {
  const router = useRouter();
  const [anchor, setAnchor] = useState(() => Date.now());
  const raw =
    typeof router.query.dateRange === "string"
      ? router.query.dateRange
      : undefined;
  const { window, error } = agentWindow(raw, anchor);
  const scope: AgentScope = {
    projectId,
    ...window,
    environment:
      typeof router.query.environment === "string"
        ? router.query.environment
        : null,
  };
  const update = (values: Record<string, string | number | undefined>) =>
    router.replace(
      { pathname: router.pathname, query: { ...router.query, ...values } },
      undefined,
      { shallow: true },
    );
  const updateScope = (values: Record<string, string | undefined>) =>
    update({
      ...values,
      page: undefined,
      runPage: undefined,
      tracePage: undefined,
      skillPage: undefined,
    });
  return {
    scope,
    error,
    enabled: !error && router.isReady,
    update,
    refreshWindow: () => {
      if (raw !== undefined) return false;
      setAnchor(Date.now());
      return true;
    },
    setEnvironment: (environment: string | null) =>
      updateScope({ environment: environment ?? undefined }),
    setTimeRange: (range: TimeRange) => {
      const absolute = toAbsoluteTimeRange(range);
      if (absolute)
        return updateScope({
          dateRange: `${absolute.from.getTime()}-${absolute.to.getTime()}`,
        });
    },
  };
}

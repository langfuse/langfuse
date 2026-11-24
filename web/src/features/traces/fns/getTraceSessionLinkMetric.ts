import {
  type EntityDetailHeaderConfiguration,
  type HeaderMetric,
} from "@/src/components/ObservabilityEntityDetailHeader/ObservabilityEntityDetailHeader";
import { resolveTraceScope } from "./resolveTraceScope";

export function getTraceSessionLinkMetric({
  projectId,
  header,
  ...scope
}: Parameters<typeof resolveTraceScope>[0] & {
  projectId: string;
  header: EntityDetailHeaderConfiguration;
}): HeaderMetric | undefined {
  if (!scope.sessionId) return undefined;
  const { canSelectSession } = resolveTraceScope(scope);
  if (canSelectSession && header.headerProps.titleTabs) return undefined;
  return {
    id: "session",
    type: "link",
    href: `/project/${projectId}/sessions/${encodeURIComponent(scope.sessionId)}`,
    text: "session",
    searchText: `session ${scope.sessionId}`,
  };
}

import { type TraceProps } from "../components/Trace";

export function resolveTraceScope({
  unifiedTraceSessionViewEnabled,
  isV4,
  isProjectMember,
  sessionId,
  aggregation,
  context,
}: {
  unifiedTraceSessionViewEnabled: boolean;
  isV4: boolean;
  isProjectMember: boolean;
  sessionId: string | null | undefined;
  aggregation: string | readonly string[] | null | undefined;
  context: TraceProps["context"];
}) {
  const showScopeToggle = unifiedTraceSessionViewEnabled && isV4;
  const canSelectSession =
    showScopeToggle &&
    isProjectMember &&
    !!sessionId &&
    context !== "annotation";

  return {
    showScopeToggle,
    canSelectSession,
    isSessionScope: canSelectSession && aggregation === "session",
  };
}

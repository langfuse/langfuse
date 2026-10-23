export function resolveTraceScope({
  internalFeaturesEnabled,
  isV4,
  isProjectMember,
  sessionId,
  aggregation,
  context,
}: {
  internalFeaturesEnabled: boolean;
  isV4: boolean;
  isProjectMember: boolean;
  sessionId: string | null | undefined;
  aggregation: string | readonly string[] | null | undefined;
  context: TraceProps["context"];
}) {
  const showScopeToggle = internalFeaturesEnabled && isV4;
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
import { type TraceProps } from "../components/Trace";

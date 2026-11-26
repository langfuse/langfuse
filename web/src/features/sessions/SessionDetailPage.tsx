import {
  SessionEventsPage,
  SessionPage,
} from "@/src/features/sessions/SessionPages";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { RouteParamsPendingFallback } from "@/src/components/RouteParamsPendingFallback/RouteParamsPendingFallback";
import { useReadyRouteParams } from "@/src/hooks/useReadyRouteParams";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { ConnectedSessionDetailPage } from "./ConnectedSessionDetailPage/ConnectedSessionDetailPage";

export default function SessionDetailPage() {
  const route = useReadyRouteParams(["projectId", "sessionId"]);
  const { isV4 } = useReadPath();
  const unifiedTraceSessionViewEnabled = useIsFeatureEnabled(
    "unifiedTraceSessionView",
    { projectId: route.ready ? route.params.projectId : "" },
  );

  if (!route.ready) return <RouteParamsPendingFallback />;

  const { projectId, sessionId } = route.params;

  if (isV4 && unifiedTraceSessionViewEnabled) {
    return (
      <ConnectedSessionDetailPage projectId={projectId} sessionId={sessionId} />
    );
  }

  return isV4 ? (
    <SessionEventsPage sessionId={sessionId} projectId={projectId} />
  ) : (
    <SessionPage sessionId={sessionId} projectId={projectId} />
  );
}

import { SessionEventsPage, SessionPage } from "@/src/sessions/SessionPages";
import { useReadPath } from "@/src/tracing/observations";
import {
  RouteParamsPendingFallback,
  useReadyRouteParams,
} from "@/src/app/hooks/useReadyRouteParams";

export default function SessionDetailPage() {
  const route = useReadyRouteParams(["projectId", "sessionId"]);
  const { isV4 } = useReadPath();

  if (!route.ready) return <RouteParamsPendingFallback />;

  const { projectId, sessionId } = route.params;

  return isV4 ? (
    <SessionEventsPage sessionId={sessionId} projectId={projectId} />
  ) : (
    <SessionPage sessionId={sessionId} projectId={projectId} />
  );
}

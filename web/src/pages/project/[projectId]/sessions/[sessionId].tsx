import { SessionEventsPage, SessionPage } from "@/src/components/session";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import {
  RouteParamsPendingFallback,
  useReadyRouteParams,
} from "@/src/hooks/useReadyRouteParams";

export default function Session() {
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

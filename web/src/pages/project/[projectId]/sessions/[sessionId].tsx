import { SessionEventsPage, SessionPage } from "@/src/components/session";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import {
  RouteParamsPendingFallback,
  useReadyRouteParams,
} from "@/src/hooks/useReadyRouteParams";

export default function Session() {
  const route = useReadyRouteParams(["projectId", "sessionId"]);
  const { isBetaEnabled } = useV4Beta();

  if (!route.ready) return <RouteParamsPendingFallback />;

  const { projectId, sessionId } = route.params;

  return isBetaEnabled ? (
    <SessionEventsPage sessionId={sessionId} projectId={projectId} />
  ) : (
    <SessionPage sessionId={sessionId} projectId={projectId} />
  );
}

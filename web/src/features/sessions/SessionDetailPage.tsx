import {
  SessionEventsPage,
  SessionPage,
} from "@/src/features/sessions/SessionPages";
import { useReadPath } from "@/src/features/events";
import { useReadyRouteParams } from "@/src/hooks/useReadyRouteParams";
import { Spinner } from "@/src/components/layouts/spinner";

export default function SessionDetailPage() {
  const route = useReadyRouteParams(["projectId", "sessionId"]);
  const { isV4 } = useReadPath();

  if (!route.ready)
    return (
      <div className="bg-background fixed inset-0 z-50 flex">
        <Spinner message="Loading" />
      </div>
    );

  const { projectId, sessionId } = route.params;

  return isV4 ? (
    <SessionEventsPage sessionId={sessionId} projectId={projectId} />
  ) : (
    <SessionPage sessionId={sessionId} projectId={projectId} />
  );
}

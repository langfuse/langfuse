import { useRouter } from "next/router";
import { SessionEventsPage, SessionPage } from "@/src/components/session";
import { withRouterReady } from "@/src/components/with-router-ready";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

function Trace() {
  const router = useRouter();
  const sessionId = router.query.sessionId as string;
  const projectId = router.query.projectId as string;
  const { isBetaEnabled } = useV4Beta();

  return isBetaEnabled ? (
    <SessionEventsPage sessionId={sessionId} projectId={projectId} />
  ) : (
    <SessionPage sessionId={sessionId} projectId={projectId} />
  );
}

export default withRouterReady(Trace);

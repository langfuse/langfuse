import {
  SessionBadge,
  UserIdBadge,
} from "@/src/features/traces/components/TraceMetadataBadges";

type ObservationIdentityBadgesProps = {
  projectId: string;
  observationSessionId: string | null | undefined;
  observationUserId: string | null | undefined;
  traceSessionId: string | null | undefined;
  traceUserId: string | null | undefined;
};

export function ObservationIdentityBadges({
  projectId,
  observationSessionId,
  observationUserId,
  traceSessionId,
  traceUserId,
}: ObservationIdentityBadgesProps) {
  const hasDistinctSessionId =
    Boolean(observationSessionId) && observationSessionId !== traceSessionId;
  const hasDistinctUserId =
    Boolean(observationUserId) && observationUserId !== traceUserId;

  return (
    <>
      {hasDistinctSessionId ? (
        <SessionBadge
          sessionId={observationSessionId ?? null}
          projectId={projectId}
        />
      ) : null}
      {hasDistinctUserId ? (
        <UserIdBadge userId={observationUserId ?? null} projectId={projectId} />
      ) : null}
    </>
  );
}

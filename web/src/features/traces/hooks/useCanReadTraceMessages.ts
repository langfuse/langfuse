import { useContext } from "react";
import { SessionContext } from "next-auth/react";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

/**
 * Resolves whether the active viewer can read trace/observation message content
 * (`input`, `output`, `toolCalls`, transcripts, raw downloads).
 *
 * - Authenticated project members require `traces:readMessage`.
 * - Unauthenticated/non-member viewers of a public trace or session are allowed.
 * - While the session is loading, `canReadTraceMessages` is false and
 *   `isRestricted` stays false to avoid flashing restricted states.
 */
export function useCanReadTraceMessages(params: {
  projectId: string | undefined;
  isPublic?: boolean;
}): {
  canReadTraceMessages: boolean;
  isRestricted: boolean;
  isLoading: boolean;
} {
  const { projectId, isPublic = false } = params;
  const session = useContext(SessionContext);

  if (!projectId) {
    return {
      canReadTraceMessages: false,
      isRestricted: false,
      isLoading: false,
    };
  }

  if (!session) {
    return {
      canReadTraceMessages: true,
      isRestricted: false,
      isLoading: false,
    };
  }

  if (session.status === "loading") {
    return {
      canReadTraceMessages: false,
      isRestricted: false,
      isLoading: true,
    };
  }

  const isProjectMember = Boolean(
    session?.data?.user?.organizations.some((org) =>
      org.projects.some((project) => project.id === projectId),
    ),
  );

  if (isProjectMember) {
    const canRead = hasProjectAccess({
      session: session?.data ?? null,
      projectId,
      scope: "traces:readMessage",
    });
    return {
      canReadTraceMessages: canRead,
      isRestricted: !canRead,
      isLoading: false,
    };
  }

  return {
    canReadTraceMessages: isPublic,
    isRestricted: !isPublic,
    isLoading: false,
  };
}

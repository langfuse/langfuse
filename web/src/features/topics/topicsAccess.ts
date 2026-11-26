import { type Session } from "next-auth";
import { useSession } from "next-auth/react";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

/** Visibility gate for every Topics surface: topics:read on the project. */
export function canViewTopics(
  session: Session | null,
  projectId: string | null | undefined,
) {
  return (
    !!projectId &&
    hasProjectAccess({ session, projectId, scope: "topics:read" })
  );
}

export function useCanViewTopics(projectId: string | null) {
  return canViewTopics(useSession().data, projectId);
}

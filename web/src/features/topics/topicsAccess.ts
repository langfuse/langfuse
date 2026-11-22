import { type Session } from "next-auth";
import { useSession } from "next-auth/react";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

/** Client visibility gate for every Topics surface: the deployment enables Topics and the user holds topics:read. */
export function canViewTopics(
  session: Session | null,
  projectId: string | null | undefined,
) {
  return (
    !!projectId &&
    session?.environment.topicsEnabled === true &&
    hasProjectAccess({ session, projectId, scope: "topics:read" })
  );
}

export function useCanViewTopics(projectId: string | null) {
  return canViewTopics(useSession().data, projectId);
}

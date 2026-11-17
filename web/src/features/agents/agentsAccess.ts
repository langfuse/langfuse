import { type Session } from "next-auth";
import { useSession } from "next-auth/react";
import { getContextualFeatureFlags } from "@/src/features/feature-flags/utils";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

/** Agent discovery is an explicit preview; experimental mode alone does not enable it. */
export function canViewAgents(session: Session | null, projectId: string) {
  return (
    session?.user?.v4BetaEnabled === true &&
    getContextualFeatureFlags(session?.user, { projectId })?.agentsView ===
      true &&
    hasProjectAccess({ session, projectId, scope: "project:read" })
  );
}

export function useCanViewAgents(projectId: string) {
  return canViewAgents(useSession().data, projectId);
}

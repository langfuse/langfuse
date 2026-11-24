import { type Session } from "next-auth";
import { useSession } from "next-auth/react";
import { env } from "@/src/env.mjs";
import {
  getContextualFeatureFlags,
  isInternalViewEnabled,
} from "@/src/features/feature-flags/utils";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

/** Visibility gate for every Topics surface: deployment switch, the Topics preview on Cloud only, and topics:read. */
export function canViewTopics(
  session: Session | null,
  projectId: string | null | undefined,
) {
  return (
    !!projectId &&
    session?.environment?.topicsEnabled === true &&
    (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ||
      isInternalViewEnabled(session) ||
      getContextualFeatureFlags(session?.user, { projectId })
        ?.langfuseTopics === true) &&
    hasProjectAccess({ session, projectId, scope: "topics:read" })
  );
}

export function useCanViewTopics(projectId: string | null) {
  return canViewTopics(useSession().data, projectId);
}

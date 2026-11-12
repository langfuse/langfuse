import { type Session } from "next-auth";
import { useSession } from "next-auth/react";
import { isInternalViewEnabled } from "@/src/features/feature-flags/utils";
import { isEventsDispatchAvailable } from "@/src/features/events-dispatch/isEventsDispatchAvailable";
import { useProject } from "@/src/features/projects/hooks";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

type TopicsProject = { id: string; topicsEnabled?: boolean };

/** Visibility gate for every Topics surface: project gate, internal view or feature preview, and topics:read. */
export function canViewTopics(
  session: Session | null,
  project: TopicsProject | null | undefined,
) {
  return (
    isEventsDispatchAvailable(
      session,
      project,
      isInternalViewEnabled(session),
    ) &&
    hasProjectAccess({ session, projectId: project.id, scope: "topics:read" })
  );
}

/** Resolves the project like the rest of the app. */
export function useCanViewTopics(projectId: string) {
  const session = useSession().data;
  const { project } = useProject(projectId);
  return canViewTopics(session, project);
}

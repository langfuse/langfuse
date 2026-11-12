import { type Session } from "next-auth";
import { getContextualFeatureFlags } from "@/src/features/feature-flags/utils";

type EventsDispatchProject = { id: string; topicsEnabled?: boolean };

/**
 * Project allowlist plus internal view or the Topics preview.
 * The caller supplies the internal-view bit. Topics passes the session flag.
 * Trace-transcript evals pass the current view-mode setting.
 */
export function isEventsDispatchAvailable(
  session: Session | null,
  project: EventsDispatchProject | null | undefined,
  internalViewEnabled: boolean,
): project is EventsDispatchProject {
  return (
    !!project &&
    project.topicsEnabled === true &&
    (internalViewEnabled ||
      getContextualFeatureFlags(session?.user, { projectId: project.id })
        ?.langfuseTopics === true)
  );
}

import { type Plan } from "@langfuse/shared";

import {
  getSessionEnvironment,
  getSessionOrganizations,
  type MaybeSession,
} from "@/src/features/auth/lib/sessionAccessors";

/** getSessionPlan is the plan of the self-hosted instance or of the session organization that owns the page. */
export function getSessionPlan(
  session: MaybeSession,
  {
    projectId,
    organizationId,
  }: {
    projectId: string | string[] | undefined;
    organizationId: string | string[] | undefined;
  },
): Plan | undefined {
  // if on a self-hosted instance with an active license, get the plan of the self-hosted instance
  const selfHostedInstancePlan =
    getSessionEnvironment(session)?.selfHostedInstancePlan;
  if (selfHostedInstancePlan) return selfHostedInstancePlan;

  // if on an organization page, get the plan of the organization
  if (organizationId) {
    const org = getSessionOrganizations(session).find(
      (org) => org.id === organizationId,
    );
    return org?.plan ?? "oss";
  }

  // if on a project page, get the plan of the organization that the project belongs to
  if (projectId) {
    const org = getSessionOrganizations(session).find((org) =>
      org.projects.some((proj) => proj.id === projectId),
    );
    return org?.plan ?? "oss";
  }

  return undefined;
}

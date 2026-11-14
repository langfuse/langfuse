import { type Plan } from "@langfuse/shared";

import {
  entitlementAccess,
  type Entitlement,
  type EntitlementLimit,
} from "@/src/features/entitlements/constants/entitlements";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import {
  findSessionOrganization,
  findSessionProjectOrganization,
  getSessionEnvironment,
  getSessionOrganizations,
  type MaybeSession,
} from "./sessionAccessors";
import { type PolicySession } from "./sessionCallback";

/** hasEntitlement reports whether the plan of the session organization owning the project or org grants entitlement. */
export const hasEntitlement = (
  p: { entitlement: Entitlement } & OrganizationTarget,
): boolean =>
  hasEntitlementBasedOnPlan({
    plan: targetPlan(p),
    entitlement: p.entitlement,
  });

/** hasEntitlementLimit is the limit the target organization's plan sets on entitlementLimit, or false when unlimited. */
export const hasEntitlementLimit = (
  p: { entitlementLimit: EntitlementLimit } & OrganizationTarget,
): number | false =>
  entitlementAccess[targetPlan(p)].entitlementLimits[p.entitlementLimit];

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
  const selfHostedInstancePlan =
    getSessionEnvironment(session)?.selfHostedInstancePlan;
  if (selfHostedInstancePlan) return selfHostedInstancePlan;
  if (organizationId) {
    const org = getSessionOrganizations(session).find(
      (org) => org.id === organizationId,
    );
    return org?.plan ?? "oss";
  }
  if (projectId) {
    const org = getSessionOrganizations(session).find((org) =>
      org.projects.some((project) => project.id === projectId),
    );
    return org?.plan ?? "oss";
  }
  return undefined;
}

/** targetPlan is the plan of the session organization a target names, falling back to oss. */
function targetPlan(p: OrganizationTarget): Plan {
  return targetOrganization(p)?.plan ?? "oss";
}

/** targetOrganization is the session organization a target names, directly or through its project. */
function targetOrganization(p: OrganizationTarget) {
  if ("projectId" in p) {
    return findSessionProjectOrganization(p.session, p.projectId);
  }
  return findSessionOrganization(p.session, p.orgId);
}

/** OrganizationTarget names a session organization by id or through one of its projects. */
type OrganizationTarget = { session: PolicySession } & (
  | { projectId: string }
  | { orgId: string }
);

import { type Session } from "next-auth";

import { getContextualFeatureFlags } from "@/src/features/feature-flags/utils";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

/** gatewayOnlyLanding finds the landing org whose projects the user cannot see */
export function gatewayOnlyLanding(
  session: Session | null,
  queryOrgId: string | string[] | undefined,
): GatewayOnlyLanding | undefined {
  const org = landingOrganization(
    queryOrgId,
    session?.user?.organizations ?? [],
  );
  if (!org || canViewOrganizationProjects(session, org)) return undefined;
  return {
    organizationId: org.id,
    canUseGateway: canUseGateway(session, org.id),
  };
}

/** landingOrganization picks the org requested in the URL, or the user's only org */
function landingOrganization(
  queryOrgId: string | string[] | undefined,
  organizations: Organization[],
) {
  if (queryOrgId) return organizations.find((org) => org.id === queryOrgId);
  if (organizations.length === 1) return organizations[0];
  return undefined;
}

/** canViewOrganizationProjects is true when the user can read the org settings or any of its projects */
function canViewOrganizationProjects(
  session: Session | null,
  org: Organization,
) {
  return (
    hasOrganizationAccess({
      session,
      organizationId: org.id,
      scope: "organizationSettings:read",
    }) || org.projects.length > 0
  );
}

/** canUseGateway reports whether the user can invoke the AI Gateway in the given org */
function canUseGateway(session: Session | null, organizationId: string) {
  return (
    getContextualFeatureFlags(session?.user, { organizationId })?.aiGateway ===
      true &&
    hasOrganizationAccess({
      session,
      organizationId,
      scope: "gateway:invoke",
    })
  );
}

type GatewayOnlyLanding = { organizationId: string; canUseGateway: boolean };

type Organization = NonNullable<Session["user"]>["organizations"][number];

import { type Session } from "next-auth";

import { env } from "@/src/env.mjs";
import { GATEWAY_PAGE_SLUGS } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";
import { gatewayOnlyLanding } from "@/src/features/organizations/utils/gatewayOnlyLanding";

/** OrganizationLandingService decides where the app root sends a signed-in user */
export class OrganizationLandingService {
  constructor(private readonly session: Session) {}

  /**
   * landingPath returns the projects page of the last used org, else of the last visited
   * project's org, else of the first non-demo org whose projects the user can see. Members who
   * only use the AI Gateway in that org land on the gateway. Returns null when the user has no
   * non-demo org.
   */
  landingPath(last: LastVisited): string | null {
    const organization = this.landingOrganization(last);
    if (!organization) return null;

    if (gatewayOnlyLanding(this.session, organization.id)?.canUseGateway) {
      return buildGatewayPagePath(organization.id, GATEWAY_PAGE_SLUGS.overview);
    }
    return `/organization/${encodeURIComponent(organization.id)}`;
  }

  private landingOrganization({ organizationId, projectId }: LastVisited) {
    const organizations = (this.session.user?.organizations ?? []).filter(
      (org) => org.id !== env.NEXT_PUBLIC_DEMO_ORG_ID,
    );
    const lastOrganization = organizations.find(
      (org) => org.id === organizationId && this.canOpen(org.id),
    );
    const lastProjectOrganization = projectId
      ? organizations.find((org) =>
          org.projects.some((project) => project.id === projectId),
        )
      : undefined;
    return (
      lastOrganization ??
      lastProjectOrganization ??
      organizations.find((org) => !gatewayOnlyLanding(this.session, org.id)) ??
      organizations.find((org) => this.canOpen(org.id)) ??
      organizations[0]
    );
  }

  /** Gateway-only members cannot open an org whose gateway is unavailable. */
  private canOpen(organizationId: string) {
    return (
      gatewayOnlyLanding(this.session, organizationId)?.canUseGateway !== false
    );
  }
}

/** LastVisited holds the ids recorded by the visit cookies; either may be missing. */
export type LastVisited = {
  organizationId: string | null;
  projectId: string | null;
};

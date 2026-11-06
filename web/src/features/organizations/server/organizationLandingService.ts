import { type Session } from "next-auth";

import { env } from "@/src/env.mjs";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";
import { gatewayOnlyLanding } from "@/src/features/organizations/utils/gatewayOnlyLanding";

/** OrganizationLandingService decides where the app root sends a signed-in user */
export class OrganizationLandingService {
  constructor(private readonly session: Session) {}

  /**
   * landingPath returns the projects page of the last visited project's org,
   * else of the first non-demo org. Members who only use the AI Gateway land
   * on the gateway. Returns null when the user has no non-demo org.
   */
  landingPath(lastProjectId: string | null): string | null {
    const organization = this.landingOrganization(lastProjectId);
    if (!organization) return null;

    if (gatewayOnlyLanding(this.session, organization.id)?.canUseGateway) {
      return buildGatewayPagePath(organization.id);
    }
    return `/organization/${encodeURIComponent(organization.id)}`;
  }

  private landingOrganization(lastProjectId: string | null) {
    const organizations = (this.session.user?.organizations ?? []).filter(
      (org) => org.id !== env.NEXT_PUBLIC_DEMO_ORG_ID,
    );
    const lastProjectOrganization = lastProjectId
      ? organizations.find((org) =>
          org.projects.some((project) => project.id === lastProjectId),
        )
      : undefined;
    return lastProjectOrganization ?? organizations[0];
  }
}

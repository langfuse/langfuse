import { type Session } from "next-auth";

import { env } from "@/src/env.mjs";
import { gatewayOnlyLanding } from "@/src/features/organizations/utils/gatewayOnlyLanding";

/** OrganizationLandingService decides where the app root sends a signed-in user */
export class OrganizationLandingService {
  constructor(private readonly session: Session) {}

  /**
   * landingPath returns the projects page of the last visited project's org, else of the newest
   * non-demo org the user can open. Returns null when the user has no non-demo org.
   */
  landingPath(lastProjectId: string | null): string | null {
    const organization = this.landingOrganization(lastProjectId);
    if (!organization) return null;
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
    return (
      lastProjectOrganization ??
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

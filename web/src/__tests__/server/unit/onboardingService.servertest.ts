import { Role } from "@langfuse/shared/src/db";
import {
  buildStarterProjectMetadata,
  type StarterProjectMetadata,
} from "@/src/features/onboarding/lib/starterProjectMetadata";
import {
  resolveOnboardingRedirectTarget,
  type RealOrganizationMembership,
} from "@/src/features/onboarding/server/onboardingService";

const makeMembership = ({
  orgId,
  role = Role.OWNER,
  projects,
}: {
  orgId: string;
  role?: Role;
  projects: Array<{
    id: string;
    metadata?: Record<string, unknown> | StarterProjectMetadata;
  }>;
}) =>
  ({
    role,
    ProjectMemberships: [],
    organization: {
      id: orgId,
      projects,
    },
  }) as RealOrganizationMembership;

describe("resolveOnboardingRedirectTarget", () => {
  it("routes existing readable projects through project home", () => {
    const result = resolveOnboardingRedirectTarget({
      userId: "user-1",
      organizationMemberships: [
        makeMembership({
          orgId: "org-1",
          projects: [{ id: "project-1", metadata: {} }],
        }),
      ],
    });

    expect(result).toMatchObject({
      organizationId: "org-1",
      projectId: "project-1",
      redirectTo: "/project/project-1",
      showStarterProjectInvitePrompt: false,
    });
  });

  it("routes onboarding starter projects directly to traces", () => {
    const result = resolveOnboardingRedirectTarget({
      userId: "user-1",
      organizationMemberships: [
        makeMembership({
          orgId: "org-1",
          projects: [
            {
              id: "project-1",
              metadata: buildStarterProjectMetadata({
                userId: "user-1",
              }),
            },
          ],
        }),
      ],
    });

    expect(result).toMatchObject({
      organizationId: "org-1",
      projectId: "project-1",
      redirectTo: "/project/project-1/traces",
      showStarterProjectInvitePrompt: true,
    });
  });
});

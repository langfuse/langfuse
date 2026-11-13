import { render, screen } from "@testing-library/react";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { ProjectGrid } from "@/src/features/projects-overview/components/ProjectGrid";
import { type OrganizationOverview } from "@/src/features/projects-overview/fns/projectsOverview/buildProjectsOverview";

it("gives gateway-only members an entry to their gateway instead of project-creation advice", () => {
  const organization = {
    id: "gateway-org",
    name: "Gateway organization",
    plan: "cloud:hobby",
    role: "AI_GATEWAY",
    projects: [],
    isDemo: false,
    loadState: "loaded",
    memberCount: null,
    usage: null,
  } satisfies OrganizationOverview;
  const session = {
    user: {
      organizations: [
        {
          ...organization,
          featureFlags: testFeatureFlags({ aiGateway: true }),
        },
      ],
      featureFlags: testFeatureFlags(),
    },
  } as unknown as Session;

  render(
    <SessionProvider session={session}>
      <ProjectGrid organization={organization} />
    </SessionProvider>,
  );

  expect(screen.getByRole("link", { name: "Open AI Gateway" })).toHaveAttribute(
    "href",
    "/organization/gateway-org",
  );
  expect(screen.queryByText("No projects yet")).not.toBeInTheDocument();
});

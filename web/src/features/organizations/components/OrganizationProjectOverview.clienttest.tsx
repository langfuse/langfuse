import { render, screen } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

import { OrganizationProjectOverview } from "@/src/features/organizations/components/OrganizationProjectOverview";
import { createProjectRoute } from "@/src/features/setup";
import { useIsFeatureEnabled } from "@/src/features/feature-flags";

vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));
vi.mock("next/router", () => ({ useRouter: vi.fn() }));
vi.mock("use-query-params", () => ({
  StringParam: {},
  useQueryParams: () => [{ search: undefined }, vi.fn()],
}));
vi.mock("@/src/components/layouts/ContainerPage", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/src/components/layouts/header", () => ({
  default: ({ title }: { title: string }) => <h2>{title}</h2>,
}));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/features/developer-tools", () => ({
  AgentToolsBanner: () => null,
}));
vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiEnabled: () => false,
}));
vi.mock("@/src/features/v4-migration/V4MigrationBanner", () => ({
  V4MigrationBanner: () => null,
  useV4MigrationBannerState: () => ({
    projectsNeedingMigration: 0,
    totalProjects: 0,
  }),
}));
vi.mock("@/src/features/v4-migration/hooks/useV4MigrationData", () => ({
  useAccountV4MigrationData: () => new Map(),
}));
vi.mock("@/src/features/ai-gateway/hooks/useGatewayLaunchEligibility", () => ({
  useGatewayLaunchTarget: () => null,
}));
vi.mock("@/src/features/feature-flags", () => ({
  useIsFeatureEnabled: vi.fn(() => true),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    organizations: {
      lastTraceByProject: { useQuery: () => ({ isSuccess: false }) },
    },
    aiGateway: {
      listApiKeys: { useQuery: () => ({ data: undefined }) },
      getSetupStatus: { useQuery: () => ({ data: undefined }) },
      getConfig: { useQuery: () => ({ data: undefined }) },
    },
  },
}));

describe("OrganizationProjectOverview", () => {
  beforeEach(() => {
    vi.mocked(useIsFeatureEnabled).mockReturnValue(true);
    vi.mocked(useRouter).mockReturnValue({
      query: {},
      replace: vi.fn(),
    } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(useSession).mockReturnValue({
      status: "authenticated",
      update: vi.fn(),
      data: {
        expires: "",
        user: {
          id: "user-1",
          admin: false,
          organizations: [
            {
              id: "gateway-org",
              name: "Gateway Org",
              role: "AI_GATEWAY",
              plan: "oss",
              projects: [],
            },
            {
              id: "owner-org",
              name: "Owner Org",
              role: "OWNER",
              plan: "oss",
              projects: [],
            },
            {
              id: "project-org",
              name: "Project Org",
              role: "MEMBER",
              plan: "oss",
              projects: [
                { id: "project-1", name: "Project 1", role: "MEMBER" },
              ],
            },
          ],
        },
        environment: { aiGatewayDeployed: true },
      },
    } as unknown as ReturnType<typeof useSession>);
  });

  it("points orgs without visible projects to their settings", () => {
    render(<OrganizationProjectOverview />);

    expect(
      screen
        .getAllByRole("link", { name: "Organization settings" })
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "/organization/gateway-org/settings",
      "/organization/owner-org/settings",
    ]);
    expect(screen.getByText("Project 1")).toBeInTheDocument();
  });

  it("offers project creation only to members who can create projects", () => {
    render(<OrganizationProjectOverview />);

    expect(
      screen
        .getAllByRole("link", { name: "New project" })
        .map((link) => link.getAttribute("href")),
    ).toEqual([createProjectRoute("owner-org")]);
  });

  it("tells only members who cannot create projects that they lack project access", () => {
    render(<OrganizationProjectOverview />);

    expect(
      screen.getAllByText(
        "You don't have access to any projects in this organization.",
      ),
    ).toHaveLength(1);
    expect(
      screen.getAllByText("This organization has no projects yet."),
    ).toHaveLength(1);
  });
  it("sends gateway-only members to their organization settings", () => {
    const replace = vi.fn(() => Promise.resolve(true));
    vi.mocked(useRouter).mockReturnValue({
      query: { organizationId: "gateway-org" },
      replace,
    } as unknown as ReturnType<typeof useRouter>);

    render(<OrganizationProjectOverview />);

    expect(replace).toHaveBeenCalledWith("/organization/gateway-org/settings");
  });

  it("tells gateway-only members when the AI Gateway is off for their organization", () => {
    const replace = vi.fn(() => Promise.resolve(true));
    vi.mocked(useRouter).mockReturnValue({
      query: { organizationId: "gateway-org" },
      replace,
    } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(useIsFeatureEnabled).mockReturnValue(false);

    render(<OrganizationProjectOverview />);

    expect(
      screen.getByText(
        "AI Gateway is not enabled for this organization. Ask an organization admin to change your role.",
      ),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

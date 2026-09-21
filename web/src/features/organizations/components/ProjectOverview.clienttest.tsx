import { render, screen } from "@testing-library/react";

import { OrganizationProjectOverview } from "./ProjectOverview";

const { sessionState, routerState, adminOrgQuery } = vi.hoisted(() => ({
  sessionState: {
    status: "authenticated" as "authenticated" | "loading",
    data: {
      user: {
        admin: true,
        canCreateOrganizations: false,
        organizations: [] as Array<{
          id: string;
          name: string;
          plan: string;
          projects: Array<{
            id: string;
            name: string;
            deletedAt: Date | null;
          }>;
        }>,
      },
    },
  },
  routerState: {
    query: { organizationId: "customer-org" } as Record<string, string>,
  },
  adminOrgQuery: {
    data: undefined as
      | {
          id: string;
          name: string;
          plan: string;
          projects: Array<{
            id: string;
            name: string;
            deletedAt: Date | null;
          }>;
        }
      | undefined,
    isPending: false,
    isLoading: false,
  },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => sessionState,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: routerState.query,
    asPath: `/organization/${routerState.query.organizationId ?? ""}`,
    pathname: "/organization/[organizationId]",
  }),
}));

vi.mock("use-query-params", () => ({
  StringParam: {},
  useQueryParams: () => [{ search: undefined }, vi.fn()],
}));

vi.mock("@langfuse/shared", () => ({
  isCloudPlan: () => false,
  planLabels: {},
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    organizations: {
      byId: {
        useQuery: () => adminOrgQuery,
      },
      lastTraceByProject: {
        useQuery: () => ({ data: [], isSuccess: true }),
      },
    },
  },
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

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/developer-tools/components/AgentToolsBanner", () => ({
  AgentToolsBanner: () => null,
}));

vi.mock("@/src/components/layouts/container-page", () => ({
  default: ({
    headerProps,
    children,
  }: {
    headerProps: { title: string };
    children: React.ReactNode;
  }) => (
    <div>
      <h1>{headerProps.title}</h1>
      {children}
    </div>
  ),
}));

const customerOrg = {
  id: "customer-org",
  name: "Customer Org",
  plan: "cloud:hobby",
  projects: [
    {
      id: "customer-project",
      name: "Customer Project",
      deletedAt: null,
    },
  ],
};

describe("OrganizationProjectOverview", () => {
  beforeEach(() => {
    sessionState.status = "authenticated";
    sessionState.data.user.admin = true;
    sessionState.data.user.organizations = [];
    routerState.query = { organizationId: "customer-org" };
    adminOrgQuery.data = customerOrg;
    adminOrgQuery.isPending = false;
    adminOrgQuery.isLoading = false;
  });

  it("waits for the admin fallback instead of flashing Organization not found", () => {
    adminOrgQuery.data = undefined;
    adminOrgQuery.isPending = true;
    adminOrgQuery.isLoading = true;

    render(<OrganizationProjectOverview />);

    expect(screen.getByText("loading...")).toBeVisible();
    expect(
      screen.queryByText("Organization not found"),
    ).not.toBeInTheDocument();
  });

  it("shows the admin fallback org instead of Organization not found", () => {
    render(<OrganizationProjectOverview />);

    expect(
      screen.queryByText("Organization not found"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Customer Org" })).toBeVisible();
    expect(screen.getByText("Customer Project")).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to project" })).toHaveAttribute(
      "href",
      "/project/customer-project",
    );
  });

  it("keeps Organization not found for a non-admin without membership", () => {
    sessionState.data.user.admin = false;
    adminOrgQuery.data = undefined;

    render(<OrganizationProjectOverview />);

    expect(screen.getByText("Organization not found")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Customer Org" }),
    ).not.toBeInTheDocument();
  });
});

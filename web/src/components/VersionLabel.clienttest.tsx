import { fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  env: {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined as string | undefined,
  },
  router: {
    query: {} as Record<string, string>,
  },
  session: {
    status: "authenticated",
    data: {
      environment: {
        selfHostedInstancePlan: undefined,
      },
      user: {
        organizations: [
          {
            id: "org-first",
            plan: "oss",
            projects: [{ id: "project-first" }],
          },
          {
            id: "org-active",
            plan: "oss",
            projects: [{ id: "project-active" }],
          },
        ],
      },
    },
  },
  backgroundMigrationStatusUseQuery: vi.fn(),
  checkUpdateUseQuery: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({
  env: mocks.env,
}));

vi.mock("next/router", () => ({
  useRouter: () => mocks.router,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => mocks.session,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    backgroundMigrations: {
      status: {
        useQuery: mocks.backgroundMigrationStatusUseQuery,
      },
    },
    public: {
      checkUpdate: {
        useQuery: mocks.checkUpdateUseQuery,
      },
    },
  },
}));

import { VersionLabel } from "@/src/components/VersionLabel";

describe("VersionLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    mocks.router.query = {};
    mocks.backgroundMigrationStatusUseQuery.mockReturnValue({
      data: { status: "FINISHED" },
    });
    mocks.checkUpdateUseQuery.mockReturnValue({ data: null });
  });

  it("links OSS operators to instance health from the active project organization", async () => {
    mocks.router.query = { projectId: "project-active" };

    render(<VersionLabel />);

    openVersionMenu();

    const instanceHealthItem = await screen.findByRole("menuitem", {
      name: /instance health/i,
    });

    expect(instanceHealthItem.getAttribute("href")).toBe(
      "/organization/org-active/settings/instance-health",
    );
    expect(
      screen.getByRole("menuitem", { name: /background migrations/i }),
    ).toBeInTheDocument();
  });

  it("hides the instance health entrypoint on Langfuse Cloud", () => {
    mocks.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";
    mocks.router.query = { organizationId: "org-active" };

    render(<VersionLabel />);

    openVersionMenu();

    expect(screen.queryByRole("menuitem", { name: /instance health/i })).toBe(
      null,
    );
    expect(
      screen.queryByRole("menuitem", { name: /background migrations/i }),
    ).toBe(null);
  });
});

function openVersionMenu() {
  const trigger = screen.getByRole("button");
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
}

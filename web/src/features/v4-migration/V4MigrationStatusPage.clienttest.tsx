import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import V4MigrationStatusPage from "./V4MigrationStatusPage";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  openForProject: vi.fn(),
  routerPush: vi.fn(),
  sdk: {
    status: "latest" as
      | "latest"
      | "legacy"
      | "otel_realtime"
      | "otel_header_required"
      | "no_data"
      | "checking",
    sdkUsageSeries: [],
    upgradeRequiredCount: 0,
    delayedOtelIngestionCount: 0,
  },
  // Evals are the simplest way to keep the single test project on the table:
  // ready projects are hidden, so most cases need one open action item.
  evalCount: 1,
  lastTracePending: false,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: {
      user: {
        admin: false,
        organizations: [
          {
            id: "org-1",
            name: "Test organization",
            role: "MEMBER",
            projects: [
              {
                id: "project-1",
                name: "Test project",
                role: "MEMBER",
                deletedAt: null,
              },
            ],
          },
        ],
      },
    },
  }),
}));

vi.mock("@/src/components/layouts/container-page", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/src/features/support-chat/SupportDrawerProvider", () => ({
  useSupportDrawer: () => ({ setOpen: vi.fn() }),
}));

vi.mock("@/src/features/v4-migration/V4MigrationPanelProvider", () => ({
  useV4MigrationPanel: () => ({ openForProject: mocks.openForProject }),
}));

vi.mock("@/src/features/in-app-agent/components/InAppAiAgentProvider", () => ({
  useInAppAiAgent: () => ({ setOpen: vi.fn() }),
}));

vi.mock("@/src/features/v4-migration/V4MigrationContent", () => ({
  V4_MIGRATION_DEADLINE: "November 16, 2026",
  useCopyMigrationPrompt: () => vi.fn(),
  // Stand-ins for the shared sidebar copy: the real components are covered in
  // V4MigrationContent.clienttest.tsx, here we only assert they are rendered.
  V4MigrationDocsLink: () => (
    <a href="https://langfuse.com/docs/v4">See docs.</a>
  ),
  V4MigrationDeadlineNote: () => (
    <p>
      After November 16, 2026 some features may stop working without a v4
      upgrade.
    </p>
  ),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiEnabled: () => true,
}));

vi.mock("@/src/features/v4-migration/hooks/useV4MigrationData", () => ({
  useAccountV4MigrationData: () =>
    new Map([
      [
        "project-1",
        {
          sdk: mocks.sdk,
          evals: { status: "loaded", count: mocks.evalCount },
          experiments: { status: "loaded", result: "not_required" },
          apis: { status: "loaded", count: 0 },
          exports: { status: "loaded", count: 0 },
          forceV3Experience: false,
        },
      ],
    ]),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useQueries: (
      buildQueries: (router: {
        organizations: { lastTraceByProject: () => unknown };
      }) => unknown,
    ) => {
      buildQueries({
        organizations: {
          lastTraceByProject: vi.fn(),
        },
      });
      return [
        mocks.lastTracePending
          ? { data: undefined, isError: false }
          : { data: [], isError: false },
      ];
    },
  },
}));

describe("V4MigrationStatusPage", () => {
  beforeEach(() => {
    mocks.capture.mockClear();
    mocks.openForProject.mockClear();
    mocks.routerPush.mockClear();
    mocks.sdk = {
      status: "latest",
      sdkUsageSeries: [],
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 0,
    };
    mocks.evalCount = 1;
    mocks.lastTracePending = false;
  });

  it("keeps the project table readable through horizontal scrolling", () => {
    render(<V4MigrationStatusPage />);

    const table = screen.getByRole("table");
    expect(table).toHaveClass("min-w-[60rem]", "table-auto");
    expect(table.parentElement).toHaveClass("overflow-x-auto");
  });

  it("shows migration readiness to project members", () => {
    render(<V4MigrationStatusPage />);

    expect(screen.queryByText("Migrated")).not.toBeInTheDocument();
    expect(screen.getByText("of 1 projects needs action")).toBeInTheDocument();
  });

  it("lists only the projects that still need action", () => {
    mocks.evalCount = 0;

    render(<V4MigrationStatusPage />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Test project")).not.toBeInTheDocument();
    expect(screen.getByText("of 1 projects need action")).toBeInTheDocument();
    expect(
      screen.getByText("All projects are up to date. Nothing to do here."),
    ).toBeInTheDocument();
  });

  it("hides project content until every migration check has finished", () => {
    mocks.evalCount = 0;
    mocks.sdk = {
      status: "checking",
      sdkUsageSeries: [],
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 0,
    };

    render(<V4MigrationStatusPage />);

    expect(screen.queryByText("Test project")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("What's new in v4")).not.toBeInTheDocument();
    expect(screen.getByText(/Checking project status/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("text-base", "leading-6");
    expect(screen.getByRole("status")).not.toHaveClass("text-2xl", "font-bold");
    expect(
      screen.queryByRole("img", { name: "Langfuse Icon" }),
    ).not.toBeInTheDocument();
  });

  it("hides project content until last-trace data has finished loading", () => {
    mocks.lastTracePending = true;

    render(<V4MigrationStatusPage />);

    expect(screen.queryByText("Test project")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("What's new in v4")).not.toBeInTheDocument();
    expect(screen.getByText(/Checking project status/)).toBeInTheDocument();
  });

  it("opens the summary card with a link to the v4 docs", () => {
    render(<V4MigrationStatusPage />);

    expect(screen.getByText("Upgrade to v4")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See docs." })).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/v4",
    );
    expect(
      screen.getByText(/some features may stop working/),
    ).toBeInTheDocument();
  });

  it("drops the deadline warning once nothing needs action", () => {
    mocks.evalCount = 0;

    render(<V4MigrationStatusPage />);

    expect(screen.getByRole("link", { name: "See docs." })).toBeInTheDocument();
    expect(
      screen.queryByText(/some features may stop working/),
    ).not.toBeInTheDocument();
  });

  it("uses the November 16, 2026 deadline throughout the FAQ", () => {
    render(<V4MigrationStatusPage />);

    expect(screen.getByText("on November 16, 2026")).toBeInTheDocument();
    expect(screen.getByText("On November 16, 2026")).toBeInTheDocument();
    expect(screen.queryByText(/Oct 9/)).not.toBeInTheDocument();
  });

  it("only shows the status pill when action is required", () => {
    mocks.evalCount = 0;
    mocks.sdk = {
      status: "checking",
      sdkUsageSeries: [],
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 0,
    };
    const checking = render(<V4MigrationStatusPage />);
    expect(screen.queryByText("Action needed")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Checking", { exact: true }),
    ).not.toBeInTheDocument();
    checking.unmount();

    mocks.sdk = {
      status: "legacy",
      sdkUsageSeries: [],
      upgradeRequiredCount: 1,
      delayedOtelIngestionCount: 0,
    };
    render(<V4MigrationStatusPage />);
    expect(screen.getByText("Action needed")).toBeInTheDocument();
  });

  it("links projects to traces and opens the migration panel", () => {
    render(<V4MigrationStatusPage />);

    const projectLink = screen.getByRole("link", { name: "Test project" });
    expect(projectLink).toHaveAttribute("href", "/project/project-1/traces");

    projectLink.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    fireEvent.click(projectLink);

    expect(mocks.openForProject).toHaveBeenCalledWith(
      { id: "project-1", name: "Test project", readiness: "action-needed" },
      "status_page_row",
    );
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:status_row_clicked",
    );
  });

  it("navigates row clicks to traces with the migration panel open", () => {
    render(<V4MigrationStatusPage />);

    const projectRow = screen
      .getByRole("link", { name: "Test project" })
      .closest("tr");
    expect(projectRow).not.toBeNull();

    fireEvent.click(projectRow!);

    expect(mocks.openForProject).toHaveBeenCalledWith(
      { id: "project-1", name: "Test project", readiness: "action-needed" },
      "status_page_row",
    );
    expect(mocks.routerPush).toHaveBeenCalledWith("/project/project-1/traces");
  });

  it("shows the exact number of outdated SDK configurations", () => {
    mocks.sdk = {
      status: "legacy",
      sdkUsageSeries: [],
      upgradeRequiredCount: 2,
      delayedOtelIngestionCount: 0,
    };

    render(<V4MigrationStatusPage />);

    expect(screen.getByText("2 outdated")).toBeInTheDocument();
  });

  it("shows the OTel ingestion header issue separately from outdated SDKs", () => {
    mocks.sdk = {
      status: "otel_header_required",
      sdkUsageSeries: [],
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 2,
    };

    render(<V4MigrationStatusPage />);

    expect(screen.getByText("2 OTel header issues")).toBeInTheDocument();
    expect(screen.queryByText("0 outdated")).not.toBeInTheDocument();
  });

  it("shows real-time OTel as ready without claiming an SDK version", () => {
    mocks.sdk = {
      status: "otel_realtime",
      sdkUsageSeries: [],
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 0,
    };

    render(<V4MigrationStatusPage />);

    expect(screen.queryByText("Migrated")).not.toBeInTheDocument();
    expect(screen.getByText("OTel real-time")).toBeInTheDocument();
    expect(screen.queryByText("Latest")).not.toBeInTheDocument();
  });

  it("shows no detected data while considering the project migrated", () => {
    mocks.sdk = {
      status: "no_data",
      sdkUsageSeries: [],
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 0,
    };

    render(<V4MigrationStatusPage />);

    expect(screen.queryByText("Migrated")).not.toBeInTheDocument();
    expect(screen.getByText("No data detected")).toBeInTheDocument();
  });
});

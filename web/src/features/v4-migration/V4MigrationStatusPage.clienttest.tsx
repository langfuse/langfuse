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
      | "otel_header_required",
    sdkUsageSeries: [],
    upgradeRequiredCount: 0,
    delayedOtelIngestionCount: 0,
  },
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

vi.mock(
  "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider",
  () => ({
    useInAppAiAgent: () => ({ setOpen: vi.fn() }),
  }),
);

vi.mock("@/src/features/v4-migration/V4MigrationContent", () => ({
  useCopyMigrationPrompt: () => vi.fn(),
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
          evals: { status: "loaded", count: 0 },
          apis: { status: "loaded", count: 0 },
          exports: { status: "loaded", count: 0 },
        },
      ],
    ]),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    organizations: {
      lastTraceByProject: {
        useQuery: () => ({ data: [] }),
      },
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
  });

  it("keeps the project table readable through horizontal scrolling", () => {
    render(<V4MigrationStatusPage />);

    const table = screen.getByRole("table");
    expect(table).toHaveClass("min-w-[60rem]", "table-auto");
    expect(table.parentElement).toHaveClass("overflow-x-auto");
  });

  it("shows migration readiness to project members", () => {
    render(<V4MigrationStatusPage />);

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("of 1 projects migrated")).toBeInTheDocument();
  });

  it("links projects to traces and opens the migration panel", () => {
    render(<V4MigrationStatusPage />);

    const projectLink = screen.getByRole("link", { name: "Test project" });
    expect(projectLink).toHaveAttribute("href", "/project/project-1/traces");

    projectLink.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    fireEvent.click(projectLink);

    expect(mocks.openForProject).toHaveBeenCalledWith({
      id: "project-1",
      name: "Test project",
    });
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

    expect(mocks.openForProject).toHaveBeenCalledWith({
      id: "project-1",
      name: "Test project",
    });
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

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("OTel real-time")).toBeInTheDocument();
    expect(screen.queryByText("Latest")).not.toBeInTheDocument();
  });
});

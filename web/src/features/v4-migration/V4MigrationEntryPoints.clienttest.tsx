import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ROUTES, RouteSection } from "@/src/components/layouts/routes";
import { V4MigrationNavItem } from "./V4MigrationNavItem";
import { V4MigrationProjectChip } from "./V4MigrationProjectChip";
import { type ProjectMigrationStatus } from "./migrationData";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  openMigrationPanel: vi.fn(),
  setOpenMobileSidebar: vi.fn(),
  migrationData: undefined as unknown as ProjectMigrationStatus,
  cachedActionNeeded: false,
}));

vi.mock("@/src/components/ui/sidebar", () => ({
  SidebarMenuButton: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  useSidebar: () => ({
    isMobile: false,
    setOpenMobile: mocks.setOpenMobileSidebar,
  }),
}));

vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiEnabled: () => true,
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProject: () => ({
    project: { id: "project-1", name: "Project 1" },
    organization: { id: "org-1" },
  }),
}));

vi.mock("@/src/features/v4-migration/hooks/useV4MigrationData", () => ({
  useProjectV4MigrationData: () => mocks.migrationData,
  // The nav item reads the shared migration-actions signal; unknown
  // categories keep the pill hidden.
  useProjectV4MigrationActions: () => ({
    actionNeeded: mocks.cachedActionNeeded,
  }),
}));

vi.mock("@/src/features/v4-migration/hooks/useOpenV4MigrationPanel", () => ({
  useOpenV4MigrationPanel: () => mocks.openMigrationPanel,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

const migrationStatus = (
  overrides?: Partial<ProjectMigrationStatus>,
): ProjectMigrationStatus => ({
  sdk: {
    status: "latest",
    sdkUsageSeries: [],
    upgradeRequiredCount: 0,
    delayedOtelIngestionCount: 0,
  },
  evals: { status: "loaded", count: 0 },
  experiments: { status: "loaded", result: "not_required" },
  apis: { status: "loaded", count: 0 },
  exports: { status: "loaded", count: 0 },
  forceV3Experience: false,
  ...overrides,
});

describe("v4 migration entry points", () => {
  beforeEach(() => {
    mocks.migrationData = migrationStatus();
    mocks.cachedActionNeeded = false;
  });

  it("places the Action required pill above Upgrade Plan in the secondary nav", () => {
    const secondaryTitles = ROUTES.filter(
      (route) => route.section === RouteSection.Secondary,
    ).map((route) => route.title);
    const updateIndex = secondaryTitles.indexOf("Update");
    const upgradeIndex = secondaryTitles.indexOf("Upgrade Plan");

    expect(updateIndex).toBeGreaterThanOrEqual(0);
    expect(upgradeIndex).toBeGreaterThan(updateIndex);
  });

  it("hides the sidebar item when the project is up to date", () => {
    render(<V4MigrationNavItem />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows both entry points when the project needs an update", () => {
    mocks.migrationData = migrationStatus({
      evals: { status: "loaded", count: 1 },
    });
    mocks.cachedActionNeeded = true;

    render(
      <>
        <V4MigrationProjectChip
          project={{ id: "project-1", name: "Project 1" }}
          readiness="action-needed"
        />
        <V4MigrationNavItem />
      </>,
    );

    expect(screen.getByText("Update")).toBeInTheDocument();
    expect(screen.getByText("Action required")).toBeInTheDocument();
  });

  it("hides the sidebar item while checks are pending or unavailable", () => {
    for (const status of [
      migrationStatus({ evals: { status: "loading", count: 0 } }),
      migrationStatus({ evals: { status: "error", count: 0 } }),
    ]) {
      mocks.migrationData = status;
      const { unmount } = render(<V4MigrationNavItem />);

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      unmount();
    }
  });
});

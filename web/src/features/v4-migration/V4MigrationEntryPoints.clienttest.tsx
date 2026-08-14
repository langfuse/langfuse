import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { V4MigrationNavItem } from "./V4MigrationNavItem";
import { V4MigrationProjectChip } from "./V4MigrationProjectChip";
import { type ProjectMigrationStatus } from "./migrationData";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  openMigrationPanel: vi.fn(),
  setOpenMobileSidebar: vi.fn(),
  recordProjectState: vi.fn(),
  migrationData: undefined as unknown as ProjectMigrationStatus,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    v4Transition: {
      recordProjectState: {
        useMutation: () => ({ mutate: mocks.recordProjectState }),
      },
    },
  },
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
  });

  it("hides the project chip and sidebar item when the project is up to date", () => {
    render(
      <>
        <V4MigrationProjectChip
          project={{ id: "project-1", name: "Project 1" }}
          status={mocks.migrationData}
        />
        <V4MigrationNavItem />
      </>,
    );

    expect(screen.queryByText("Up to date")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows both entry points when the project needs an update", () => {
    mocks.migrationData = migrationStatus({
      evals: { status: "loaded", count: 1 },
    });

    render(
      <>
        <V4MigrationProjectChip
          project={{ id: "project-1", name: "Project 1" }}
          status={mocks.migrationData}
        />
        <V4MigrationNavItem />
      </>,
    );

    expect(screen.getByText("Update")).toBeInTheDocument();
    expect(screen.getByText("Action required")).toBeInTheDocument();
  });

  it("hides both entry points while checks are pending or unavailable", () => {
    for (const status of [
      migrationStatus({ evals: { status: "loading", count: 0 } }),
      migrationStatus({ evals: { status: "error", count: 0 } }),
    ]) {
      mocks.migrationData = status;
      const { unmount } = render(
        <>
          <V4MigrationProjectChip
            project={{ id: "project-1", name: "Project 1" }}
            status={status}
          />
          <V4MigrationNavItem />
        </>,
      );

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe("v4_migration:project_state_checked", () => {
  const stateCheckedCalls = () =>
    mocks.capture.mock.calls.filter(
      ([name]) => name === "v4_migration:project_state_checked",
    );

  beforeEach(() => {
    mocks.capture.mockClear();
    mocks.recordProjectState.mockClear();
    mocks.migrationData = migrationStatus();
  });

  it("captures the settled state even when the project is migrated and the pill renders nothing", () => {
    render(<V4MigrationNavItem />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(stateCheckedCalls()).toHaveLength(1);
    expect(stateCheckedCalls()[0][1]).toEqual({
      readiness: "ready",
      sdkStatus: "latest",
      projectId: "project-1",
      organizationId: "org-1",
    });
    expect(mocks.recordProjectState).toHaveBeenCalledExactlyOnceWith({
      projectId: "project-1",
      readiness: "ready",
      sdkStatus: "latest",
      hasV4Traffic: false,
    });
  });

  it("reports v4 traffic to the server when a compatible series exists", () => {
    mocks.migrationData = migrationStatus({
      sdk: {
        status: "legacy",
        sdkUsageSeries: [
          { v4MigrationStatus: "compatible" },
          { v4MigrationStatus: "upgrade_required" },
        ] as unknown as ProjectMigrationStatus["sdk"]["sdkUsageSeries"],
        upgradeRequiredCount: 1,
        delayedOtelIngestionCount: 0,
      },
    });

    render(<V4MigrationNavItem />);

    expect(mocks.recordProjectState).toHaveBeenCalledExactlyOnceWith({
      projectId: "project-1",
      readiness: "action-needed",
      sdkStatus: "legacy",
      hasV4Traffic: true,
    });
  });

  it("skips the server report when a check errored (readiness unavailable)", () => {
    mocks.migrationData = migrationStatus({
      evals: { status: "error", count: 0 },
    });

    render(<V4MigrationNavItem />);

    expect(stateCheckedCalls()).toHaveLength(1);
    expect(stateCheckedCalls()[0][1]).toMatchObject({
      readiness: "unavailable",
    });
    expect(mocks.recordProjectState).not.toHaveBeenCalled();
  });

  it("captures action-needed with the sdk status once checks settle", () => {
    mocks.migrationData = migrationStatus({
      sdk: {
        status: "legacy",
        sdkUsageSeries: [],
        upgradeRequiredCount: 1,
        delayedOtelIngestionCount: 0,
      },
    });

    render(<V4MigrationNavItem />);

    expect(stateCheckedCalls()).toHaveLength(1);
    expect(stateCheckedCalls()[0][1]).toMatchObject({
      readiness: "action-needed",
      sdkStatus: "legacy",
    });
  });

  it("holds while any check is still running and fires exactly once per settled state", () => {
    mocks.migrationData = migrationStatus({
      evals: { status: "loading", count: 0 },
    });
    const { rerender } = render(<V4MigrationNavItem />);

    expect(stateCheckedCalls()).toHaveLength(0);

    mocks.migrationData = migrationStatus();
    rerender(<V4MigrationNavItem />);
    rerender(<V4MigrationNavItem />);

    expect(stateCheckedCalls()).toHaveLength(1);
  });

  it("re-reports when the settled state changes within a long-lived mount", () => {
    mocks.migrationData = migrationStatus({
      evals: { status: "loaded", count: 2 },
    });
    const { rerender } = render(<V4MigrationNavItem />);
    expect(stateCheckedCalls()).toHaveLength(1);
    expect(stateCheckedCalls()[0][1]).toMatchObject({
      readiness: "action-needed",
    });

    // Background refetch resolves the evals — readiness flips to ready.
    mocks.migrationData = migrationStatus();
    rerender(<V4MigrationNavItem />);

    expect(stateCheckedCalls()).toHaveLength(2);
    expect(stateCheckedCalls()[1][1]).toMatchObject({ readiness: "ready" });
    expect(mocks.recordProjectState).toHaveBeenCalledTimes(2);
  });
});

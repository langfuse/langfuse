import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { V4MigrationMigratedDialog } from "./V4MigrationMigratedDialog";
import { type ProjectMigrationStatus } from "./migrationData";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  routerPush: vi.fn(),
  openWithMode: vi.fn(),
  isBetaEnabled: false,
  canToggleV4: true,
  migrationData: undefined as unknown as ProjectMigrationStatus,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProject: () => ({
    project: { id: "project-1", name: "Project 1" },
    organization: { id: "org-1" },
  }),
}));

vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiEnabled: () => true,
}));

vi.mock("@/src/features/v4-migration/hooks/useV4MigrationData", () => ({
  useProjectV4MigrationData: () => mocks.migrationData,
}));

vi.mock("@/src/features/events/hooks/useV4Beta", () => ({
  useV4Beta: () => ({
    isBetaEnabled: mocks.isBetaEnabled,
    canToggleV4: mocks.canToggleV4,
  }),
}));

vi.mock("@/src/features/support-chat/SupportDrawerProvider", () => ({
  useSupportDrawer: () => ({ openWithMode: mocks.openWithMode }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

// The client test environment does not provide window.localStorage.
const localStorageStore = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => localStorageStore.get(key) ?? null,
    setItem: (key: string, value: string) => localStorageStore.set(key, value),
    removeItem: (key: string) => localStorageStore.delete(key),
    clear: () => localStorageStore.clear(),
  },
});

const compatibleSeries = [
  { v4MigrationStatus: "compatible" },
] as unknown as ProjectMigrationStatus["sdk"]["sdkUsageSeries"];

const migratedStatus = (
  overrides?: Partial<ProjectMigrationStatus>,
): ProjectMigrationStatus => ({
  sdk: {
    status: "latest",
    sdkUsageSeries: compatibleSeries,
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

describe("V4MigrationMigratedDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.isBetaEnabled = false;
    mocks.canToggleV4 = true;
    mocks.migrationData = migratedStatus();
  });

  it("shows for a migrated project with v4 traffic and reports shown once", () => {
    const { rerender } = render(<V4MigrationMigratedDialog />);

    expect(screen.getByText("Welcome to Langfuse V4")).toBeInTheDocument();
    rerender(<V4MigrationMigratedDialog />);
    expect(
      mocks.capture.mock.calls.filter(
        ([name]) => name === "v4_migration:migrated_banner_shown",
      ),
    ).toHaveLength(1);
  });

  it("hides when the user already has the v4 view on", () => {
    mocks.isBetaEnabled = true;
    render(<V4MigrationMigratedDialog />);
    expect(
      screen.queryByText("Welcome to Langfuse V4"),
    ).not.toBeInTheDocument();
  });

  it("hides while the project still needs action", () => {
    mocks.migrationData = migratedStatus({
      evals: { status: "loaded", count: 2 },
    });
    render(<V4MigrationMigratedDialog />);
    expect(
      screen.queryByText("Welcome to Langfuse V4"),
    ).not.toBeInTheDocument();
  });

  it("does not celebrate a project that is ready only because it sent no data", () => {
    mocks.migrationData = migratedStatus({
      sdk: {
        status: "no_data",
        sdkUsageSeries: [],
        upgradeRequiredCount: 0,
        delayedOtelIngestionCount: 0,
      },
    });
    render(<V4MigrationMigratedDialog />);
    expect(
      screen.queryByText("Welcome to Langfuse V4"),
    ).not.toBeInTheDocument();
  });

  it("Got it acknowledges permanently without switching the v4 view", () => {
    render(<V4MigrationMigratedDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));

    expect(
      screen.queryByText("Welcome to Langfuse V4"),
    ).not.toBeInTheDocument();
    expect(
      window.localStorage.getItem(
        "v4-migration-migrated-dialog-acked:project-1",
      ),
    ).toBeTruthy();
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:migrated_banner_switch_clicked",
      {
        projectId: "project-1",
        surface: "dialog",
        isAcknowledgementOnly: true,
      },
    );
  });

  it("View migration status snoozes and navigates to the status page", () => {
    render(<V4MigrationMigratedDialog />);
    fireEvent.click(
      screen.getByRole("button", { name: "View migration status" }),
    );

    expect(mocks.routerPush).toHaveBeenCalledExactlyOnceWith("/v4-migration");
    expect(
      window.localStorage.getItem(
        "v4-migration-migrated-dialog-dismissed:project-1",
      ),
    ).toBeTruthy();
  });

  it("support link opens the drawer with the migration topic and keeps the dialog", () => {
    render(<V4MigrationMigratedDialog />);
    fireEvent.click(
      screen.getByRole("button", { name: "Something looks wrong?" }),
    );

    expect(mocks.openWithMode).toHaveBeenCalledExactlyOnceWith("form", {
      topic: "V4 Migration",
    });
    expect(screen.getByText("Welcome to Langfuse V4")).toBeInTheDocument();
  });
});

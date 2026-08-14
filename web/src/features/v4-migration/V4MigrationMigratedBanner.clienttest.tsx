import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { V4MigrationMigratedBanner } from "./V4MigrationMigratedBanner";
import { type ProjectMigrationStatus } from "./migrationData";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  setBetaEnabled: vi.fn(),
  openWithMode: vi.fn(),
  isBetaEnabled: false,
  canToggleV4: true,
  migrationData: undefined as unknown as ProjectMigrationStatus,
}));

vi.mock("@/src/components/ui/layer", () => ({
  Layer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
    setBetaEnabled: mocks.setBetaEnabled,
    isLoading: false,
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

describe("V4MigrationMigratedBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.isBetaEnabled = false;
    mocks.canToggleV4 = true;
    mocks.migrationData = migratedStatus();
  });

  it("shows for a migrated project with v4 traffic and reports shown once", () => {
    const { rerender } = render(<V4MigrationMigratedBanner />);

    expect(
      screen.getByText(/Migration complete — this project is v4 compatible/),
    ).toBeInTheDocument();
    rerender(<V4MigrationMigratedBanner />);
    expect(
      mocks.capture.mock.calls.filter(
        ([name]) => name === "v4_migration:migrated_banner_shown",
      ),
    ).toHaveLength(1);
  });

  it("hides when the user already has the v4 view on", () => {
    mocks.isBetaEnabled = true;
    render(<V4MigrationMigratedBanner />);
    expect(screen.queryByText(/Migration complete/)).not.toBeInTheDocument();
  });

  it("hides while the project still needs action", () => {
    mocks.migrationData = migratedStatus({
      evals: { status: "loaded", count: 2 },
    });
    render(<V4MigrationMigratedBanner />);
    expect(screen.queryByText(/Migration complete/)).not.toBeInTheDocument();
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
    render(<V4MigrationMigratedBanner />);
    expect(screen.queryByText(/Migration complete/)).not.toBeInTheDocument();
  });

  it("switch CTA flips the v4 view", () => {
    render(<V4MigrationMigratedBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Switch to v4" }));

    expect(mocks.setBetaEnabled).toHaveBeenCalledExactlyOnceWith(true);
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:migrated_banner_switch_clicked",
      { projectId: "project-1" },
    );
  });

  it("support CTA opens the drawer with the migration topic and keeps the banner", () => {
    render(<V4MigrationMigratedBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Report an issue" }));

    expect(mocks.openWithMode).toHaveBeenCalledExactlyOnceWith("form", {
      topic: "V4 Migration",
    });
    expect(screen.getByText(/Migration complete/)).toBeInTheDocument();
  });

  it("dismiss hides the banner and persists per project", () => {
    render(<V4MigrationMigratedBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText(/Migration complete/)).not.toBeInTheDocument();
    expect(
      window.localStorage.getItem(
        "v4-migration-migrated-banner-dismissed:project-1",
      ),
    ).toBeTruthy();
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:migrated_banner_dismissed",
      { projectId: "project-1" },
    );
  });
});

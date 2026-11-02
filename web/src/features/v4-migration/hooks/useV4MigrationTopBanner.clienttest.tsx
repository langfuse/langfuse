import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_API_SHUTDOWN_SCHEDULE } from "@/src/features/public-api/server/legacyApiShutdownSchedule";
import { type ProjectMigrationStatus } from "@/src/features/v4-migration/migrationData";
import { V4MigrationTopBannerView } from "@/src/features/v4-migration/V4MigrationTopBannerView";
import { useV4MigrationTopBanner } from "./useV4MigrationTopBanner";

function ConnectedBanner() {
  const banner = useV4MigrationTopBanner();
  return banner ? <V4MigrationTopBannerView {...banner} /> : <div />;
}

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  openPanel: vi.fn(),
  canManage: true,
  serverPhase: "before_stop" as string,
  statusByProjectId: new Map<string, ProjectMigrationStatus>(),
  queryInput: undefined as unknown,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ query: { v4BannerNow: "2026-11-19T10:00:00Z" } }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        organizations: [
          {
            id: "org-1",
            name: "Org 1",
            projects: [
              { id: "project-ok", name: "Ready", deletedAt: null },
              { id: "project-legacy", name: "Legacy", deletedAt: null },
              { id: "project-deleted", name: "Gone", deletedAt: new Date() },
            ],
          },
        ],
      },
    },
  }),
}));

vi.mock("@/src/env.mjs", () => ({ env: {} }));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));
vi.mock("@/src/features/organizations", () => ({
  useLangfuseCloudRegion: () => ({ isLangfuseCloud: true, region: "EU" }),
}));
vi.mock("@/src/features/projects", () => ({
  useQueryProjectOrOrganization: () => ({
    organization: { id: "org-1", name: "Org 1" },
    project: null,
  }),
}));
vi.mock("@/src/features/rbac", () => ({
  useHasOrganizationAccess: () => mocks.canManage,
}));
vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiEnabled: () => true,
}));
vi.mock("@/src/features/v4-migration/hooks/useOpenV4MigrationPanel", () => ({
  useOpenV4MigrationPanel: () => mocks.openPanel,
}));
vi.mock("@/src/features/v4-migration/hooks/useV4MigrationData", () => ({
  useAccountV4MigrationData: () => mocks.statusByProjectId,
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    v4Transition: {
      legacyApiBannerState: {
        useQuery: (input: unknown) => {
          mocks.queryInput = input;
          return {
            data: {
              phase: mocks.serverPhase,
              exempt: false,
              serverNow: new Date("2026-11-02T12:00:00Z"),
              evalsExportsStopAt:
                LEGACY_API_SHUTDOWN_SCHEDULE.evalsExportsStopAt,
              fullCutAt: LEGACY_API_SHUTDOWN_SCHEDULE.fullCutAt,
              activeWindow: null,
              nextWindow: LEGACY_API_SHUTDOWN_SCHEDULE.brownoutWindows[0],
            },
          };
        },
      },
    },
  },
}));

const status = (
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

beforeEach(() => {
  mocks.capture.mockReset();
  mocks.openPanel.mockReset();
  mocks.canManage = true;
  mocks.serverPhase = "before_stop";
  mocks.statusByProjectId = new Map([
    ["project-ok", status()],
    ["project-legacy", status({ apis: { status: "loaded", count: 2 } })],
  ]);
  sessionStorage.clear();
});

describe("useV4MigrationTopBanner", () => {
  it("counts the org's active projects and opens the first one needing action", () => {
    render(<ConnectedBanner />);

    expect(screen.getByText("Action needed before Nov 16")).toBeVisible();
    expect(
      screen.getByText(/^1 of 2 projects still uses legacy APIs\./),
    ).toBeVisible();
    expect(mocks.queryInput).toEqual({
      orgId: "org-1",
      nowOverride: "2026-11-19T10:00:00Z",
    });
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:top_banner_shown",
      { phase: "amber", role: "admin", actionNeededCount: 1 },
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Review what to update" }),
    );

    expect(mocks.openPanel).toHaveBeenCalledWith(
      { id: "project-legacy", name: "Legacy", readiness: "action-needed" },
      "top_banner",
    );
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:top_banner_cta_clicked",
      { phase: "amber", role: "admin", actionNeededCount: 1, cta: "primary" },
    );
  });

  it("shows members the admin hint instead of the fix action", () => {
    mocks.canManage = false;
    render(<ConnectedBanner />);

    expect(
      screen.queryByRole("button", { name: "Review what to update" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Ask an admin to update integrations\.$/),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Upgrade guide" })).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/v4",
    );
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:top_banner_shown",
      { phase: "amber", role: "member", actionNeededCount: 1 },
    );
  });

  it("closes the amber banner for the browser session only", () => {
    const { unmount } = render(<ConnectedBanner />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });

    expect(
      screen.queryByText("Action needed before Nov 16"),
    ).not.toBeInTheDocument();
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:top_banner_closed",
      { phase: "amber", role: "admin", actionNeededCount: 1 },
    );
    expect(sessionStorage.getItem("v4-migration-top-banner:closed")).toBe(
      "true",
    );
    unmount();
    expect(localStorage.length).toBe(0);
  });

  it("cannot be closed in the red phases, even after an amber close", () => {
    sessionStorage.setItem("v4-migration-top-banner:closed", "true");
    mocks.serverPhase = "cut";
    render(<ConnectedBanner />);

    expect(screen.getByText("Legacy APIs are off")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "See failing projects" }),
    ).toBeVisible();
  });

  it("stays hidden when the server hides it or no project needs action", () => {
    mocks.serverPhase = "hidden";
    const { result, rerender } = renderHook(() => useV4MigrationTopBanner());
    expect(result.current).toBeNull();

    mocks.serverPhase = "cut";
    mocks.statusByProjectId = new Map([
      ["project-ok", status()],
      ["project-legacy", status()],
    ]);
    rerender();
    expect(result.current).toBeNull();
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});

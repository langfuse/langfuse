import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  severity: "warning" as "off" | "warning" | "critical",
  message:
    "Legacy v3 is still in use in {projects}. Trace-level evals and exports stop on November 16. SDKs and APIs stop on November 19." as
      | string
      | null,
  statusByProjectId: new Map<string, ProjectMigrationStatus>(),
  queryInput: undefined as unknown,
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
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));
vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({ isLangfuseCloud: true, region: "EU" }),
}));
vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProjectOrOrganization: () => ({
    organization: { id: "org-1", name: "Org 1" },
    project: null,
  }),
}));
vi.mock("@/src/features/rbac/utils/checkOrganizationAccess", () => ({
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
              severity: mocks.severity,
              message: mocks.message,
              exempt: false,
            },
          };
        },
      },
    },
  },
}));

const WARNING_MESSAGE =
  "Legacy v3 is still in use in {projects}. Trace-level evals and exports stop on November 16. SDKs and APIs stop on November 19.";
const CRITICAL_MESSAGE = "Legacy v3 is turned off.";

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
  mocks.severity = "warning";
  mocks.message = WARNING_MESSAGE;
  mocks.statusByProjectId = new Map([
    ["project-ok", status()],
    ["project-legacy", status({ apis: { status: "loaded", count: 2 } })],
  ]);
  sessionStorage.clear();
});

describe("useV4MigrationTopBanner", () => {
  it("counts the org's active projects and opens the first one needing action", () => {
    render(<ConnectedBanner />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Legacy v3 is still in use in 1 project. Trace-level evals and exports stop on November 16. SDKs and APIs stop on November 19. Update",
    );
    expect(mocks.queryInput).toEqual({ orgId: "org-1" });
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:top_banner_shown",
      { severity: "warning", role: "admin", actionNeededCount: 1 },
    );

    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    expect(mocks.openPanel).toHaveBeenCalledWith(
      { id: "project-legacy", name: "Legacy", readiness: "action-needed" },
      "top_banner",
    );
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:top_banner_cta_clicked",
      {
        severity: "warning",
        role: "admin",
        actionNeededCount: 1,
        cta: "primary",
      },
    );
  });

  it("shows members the admin hint instead of the fix action", () => {
    mocks.canManage = false;
    render(<ConnectedBanner />);

    expect(
      screen.queryByRole("button", { name: "Update" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Legacy v3 is still in use in 1 project. Trace-level evals and exports stop on November 16. SDKs and APIs stop on November 19. Ask an admin to update.",
    );
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:top_banner_shown",
      { severity: "warning", role: "member", actionNeededCount: 1 },
    );
  });

  it("ignores a leftover session dismiss and has no close control", () => {
    sessionStorage.setItem("v4-migration-top-banner:closed", "true");
    render(<ConnectedBanner />);

    expect(screen.getByRole("button", { name: "Update" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
    expect(mocks.capture).not.toHaveBeenCalledWith(
      "v4_migration:top_banner_closed",
      expect.anything(),
    );
  });

  it("shows the critical message as plain text with the same update link", () => {
    sessionStorage.setItem("v4-migration-top-banner:closed", "true");
    mocks.severity = "critical";
    mocks.message = CRITICAL_MESSAGE;
    render(<ConnectedBanner />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Legacy v3 is turned off. Update",
    );
    expect(screen.getByRole("status")).toHaveAttribute(
      "data-severity",
      "critical",
    );
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeVisible();
  });

  it("stays hidden when the server turns it off or no project needs action", () => {
    mocks.severity = "off";
    mocks.message = null;
    const { result, rerender } = renderHook(() => useV4MigrationTopBanner());
    expect(result.current).toBeNull();

    mocks.severity = "critical";
    mocks.message = CRITICAL_MESSAGE;
    mocks.statusByProjectId = new Map([
      ["project-ok", status()],
      ["project-legacy", status()],
    ]);
    rerender();
    expect(result.current).toBeNull();
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});

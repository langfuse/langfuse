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
  severity: "warning" as "off" | "warning" | "critical",
  message:
    "Action required: After November 16, 2026, some features may stop working for at least one of your projects." as
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
vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiEnabled: () => true,
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
  "Action required: After November 16, 2026, some features may stop working for at least one of your projects.";

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
  mocks.severity = "warning";
  mocks.message = WARNING_MESSAGE;
  mocks.statusByProjectId = new Map([
    ["project-ok", status()],
    ["project-legacy", status({ apis: { status: "loaded", count: 2 } })],
  ]);
});

describe("useV4MigrationTopBanner", () => {
  it("links affected orgs to migration status and records the count", () => {
    render(<ConnectedBanner />);

    expect(screen.getByRole("status")).toHaveTextContent(
      `${WARNING_MESSAGE} Check migration status`,
    );
    expect(mocks.queryInput).toEqual({ orgId: "org-1" });
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:top_banner_shown",
      { severity: "warning", actionNeededCount: 1 },
    );

    const link = screen.getByRole("link", { name: "Check migration status" });
    expect(link).toHaveAttribute("href", "/v4-migration");
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:top_banner_cta_clicked",
      {
        severity: "warning",
        actionNeededCount: 1,
        cta: "primary",
      },
    );
  });

  it("stays hidden when the server turns it off or no project needs action", () => {
    mocks.severity = "off";
    mocks.message = null;
    const { result, rerender } = renderHook(() => useV4MigrationTopBanner());
    expect(result.current).toBeNull();

    mocks.severity = "critical";
    mocks.message = "Legacy v3 is turned off.";
    mocks.statusByProjectId = new Map([
      ["project-ok", status()],
      ["project-legacy", status()],
    ]);
    rerender();
    expect(result.current).toBeNull();
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});

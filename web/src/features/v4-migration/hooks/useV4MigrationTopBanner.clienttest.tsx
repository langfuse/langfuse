import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  actionNeededCount: 1,
  organization: { id: "org-1", name: "Org 1" } as {
    id: string;
    name: string;
  } | null,
  project: null as { id: string } | null,
  forceV3Settled: true,
  v4UpgradeUiEnabled: true,
  accountQueryOptions: undefined as unknown,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));
vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({ isLangfuseCloud: true, region: "EU" }),
}));
vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProjectOrOrganization: () => ({
    organization: mocks.organization,
    project: mocks.project,
  }),
}));
vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiEnabled: () => mocks.v4UpgradeUiEnabled,
}));
vi.mock("@/src/features/v4-migration/useForceV3Experience", () => ({
  useIsForceV3ExperienceSettled: () => mocks.forceV3Settled,
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    v4Transition: {
      legacyApiBannerState: {
        useQuery: (_input: undefined, options: unknown) => {
          mocks.accountQueryOptions = options;
          return {
            data: {
              severity: mocks.severity,
              message: mocks.message,
              exempt: false,
              actionNeededCount: mocks.actionNeededCount,
            },
          };
        },
      },
    },
  },
}));

const WARNING_MESSAGE =
  "Action required: After November 16, 2026, some features may stop working for at least one of your projects.";
const FIVE_MINUTES_MS = 5 * 60 * 1000;

beforeEach(() => {
  mocks.capture.mockReset();
  mocks.severity = "warning";
  mocks.message = WARNING_MESSAGE;
  mocks.actionNeededCount = 1;
  mocks.organization = { id: "org-1", name: "Org 1" };
  mocks.project = null;
  mocks.forceV3Settled = true;
  mocks.v4UpgradeUiEnabled = true;
  mocks.accountQueryOptions = undefined;
});

describe("useV4MigrationTopBanner", () => {
  it("links affected orgs to migration status and records the count", () => {
    render(<ConnectedBanner />);

    expect(screen.getByText(WARNING_MESSAGE)).toBeInTheDocument();
    expect(mocks.accountQueryOptions).toMatchObject({
      enabled: true,
      staleTime: FIVE_MINUTES_MS,
    });
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
    mocks.actionNeededCount = 0;
    rerender();
    expect(result.current).toBeNull();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it.each([
    ["account", null, null],
    ["organization", { id: "org-1", name: "Org 1" }, null],
    ["project", { id: "org-1", name: "Org 1" }, { id: "project-1" }],
  ] as const)(
    "uses the account-wide query on %s routes",
    (_route, organization, project) => {
      mocks.organization = organization;
      mocks.project = project;

      render(<ConnectedBanner />);

      expect(screen.getByText(WARNING_MESSAGE)).toBeInTheDocument();
      expect(mocks.accountQueryOptions).toMatchObject({
        enabled: true,
        staleTime: FIVE_MINUTES_MS,
      });
    },
  );

  it("waits for the force-v3 gate before checking project routes", () => {
    mocks.project = { id: "project-legacy" };
    mocks.forceV3Settled = false;

    const { result } = renderHook(() => useV4MigrationTopBanner());

    expect(result.current).toBeNull();
    expect(mocks.accountQueryOptions).toMatchObject({ enabled: false });
  });
});

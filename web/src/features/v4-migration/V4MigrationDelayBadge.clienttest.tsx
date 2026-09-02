import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { V4MigrationDelayBadge } from "./V4MigrationDelayBadge";
import {
  type V4MigrationSdkState,
  type V4MigrationSdkUsageSeries,
} from "./sdkVersionStatus";

const makeSdkUsageSeries = (
  overrides: Partial<V4MigrationSdkUsageSeries> = {},
): V4MigrationSdkUsageSeries => {
  const source = overrides.source ?? "ingestion-api-dual-write";
  const ingestionPath =
    overrides.ingestionPath ??
    (source === "ingestion-api-dual-write" ? "ingestion_api" : "otel");
  const deliveryMode =
    overrides.deliveryMode ?? (source === "otel" ? "realtime" : "delayed");
  const sdkName = overrides.sdkName ?? "python";
  const sdkVersion = overrides.sdkVersion ?? "4.7.1";
  const canonicalSdkName =
    overrides.canonicalSdkName !== undefined
      ? overrides.canonicalSdkName
      : sdkName === "python"
        ? "python"
        : sdkName === "javascript" || sdkName.startsWith("@langfuse/")
          ? "javascript"
          : null;
  const sdkVersionMajor =
    overrides.sdkVersionMajor !== undefined
      ? overrides.sdkVersionMajor
      : Number(sdkVersion.match(/^v?(\d+)/)?.[1] ?? NaN);
  const resolvedMajor = Number.isFinite(sdkVersionMajor)
    ? Number(sdkVersionMajor)
    : null;
  const latestMajor =
    canonicalSdkName === "python"
      ? 4
      : canonicalSdkName === "javascript"
        ? 5
        : null;
  const v4MigrationStatus =
    overrides.v4MigrationStatus ??
    (canonicalSdkName === null || resolvedMajor === null
      ? "unknown"
      : resolvedMajor >= (latestMajor ?? 0)
        ? "compatible"
        : "upgrade_required");
  const remediationType =
    overrides.remediationType ??
    (canonicalSdkName !== null
      ? "update_sdk"
      : ingestionPath === "otel"
        ? "update_otel_instrumentation"
        : "upgrade_instrumentation");
  const actionLevel =
    overrides.actionLevel ??
    (remediationType === "update_sdk"
      ? v4MigrationStatus === "compatible"
        ? "none"
        : "required"
      : remediationType === "update_otel_instrumentation"
        ? deliveryMode === "realtime"
          ? "none"
          : "required"
        : "required");

  return {
    source,
    ingestionPath,
    deliveryMode,
    sdkName,
    sdkVersion,
    canonicalSdkName,
    sdkVersionMajor: resolvedMajor,
    latestSdkMajor:
      overrides.latestSdkMajor !== undefined
        ? overrides.latestSdkMajor
        : latestMajor,
    isValidSdkVersion: overrides.isValidSdkVersion ?? resolvedMajor !== null,
    publicKey: overrides.publicKey ?? "pk-lf-1234567890abcdef",
    eventCount: overrides.eventCount ?? 10,
    firstSeen: overrides.firstSeen ?? "2026-07-20T10:00:00Z",
    lastSeen: overrides.lastSeen ?? "2026-07-23T10:00:00Z",
    attributionStatus: overrides.attributionStatus ?? "attributed",
    v4MigrationStatus,
    remediationType,
    actionLevel,
  };
};

const outdatedSdkSeries = () =>
  makeSdkUsageSeries({
    sdkVersion: "2.60.3",
  });

const delayedOtelSeries = () =>
  makeSdkUsageSeries({
    source: "otel-dual-write",
    sdkName: "openlit",
    canonicalSdkName: null,
    publicKey: "pk-lf-otel-1234567890",
  });

const customIngestionSeries = () =>
  makeSdkUsageSeries({
    source: "ingestion-api-dual-write",
    sdkName: "unknown",
    sdkVersion: "unknown",
    canonicalSdkName: null,
    attributionStatus: "missing_name_and_version",
    publicKey: "pk-lf-custom-123456789",
  });

const mocks = vi.hoisted(() => ({
  sdk: {
    status: "latest",
    sdkUsageSeries: [],
    upgradeRequiredCount: 0,
    delayedOtelIngestionCount: 0,
  } as V4MigrationSdkState,
  v4UpgradeUiEnabled: true,
  forceV3: false,
  isV4: false,
  projectId: "project-1",
  openMigrationPanel: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiEnabled: () => mocks.v4UpgradeUiEnabled,
  useV4UpgradeUiFlag: () => mocks.v4UpgradeUiEnabled,
}));

vi.mock("@/src/features/v4-migration/useForceV3Experience", () => ({
  useForceV3Experience: () => mocks.forceV3,
}));

vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({ isV4: mocks.isV4 }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProject: () => ({
    project: { id: mocks.projectId, name: "Project One" },
    organization: { id: "org-1" },
  }),
}));

vi.mock("@/src/features/v4-migration/hooks/useOpenV4MigrationPanel", () => ({
  useOpenV4MigrationPanel: () => mocks.openMigrationPanel,
}));

vi.mock("@/src/features/v4-migration/hooks/useV4MigrationData", () => ({
  useProjectV4SdkData: () => mocks.sdk,
  useProjectV4EvalData: () => ({ status: "loaded", count: 0 }),
}));

vi.mock("@/src/features/in-app-agent/components/InAppAiAgentProvider", () => ({
  useIsInAppAgentLauncherVisible: () => false,
  useInAppAiAgent: () => ({ setOpen: vi.fn(), submit: vi.fn() }),
}));

vi.mock("@/src/features/v4-migration/useV4UpgradeAssistantSupport", () => ({
  useEvalUpgradeAssistantPlan: () => ({
    canUseAssistant: false,
    mode: "outside",
    showAssistantButton: false,
    assistantPrompt: "",
  }),
}));

const setSdk = (
  status: V4MigrationSdkState["status"],
  series: V4MigrationSdkUsageSeries[],
) => {
  mocks.sdk = {
    status,
    sdkUsageSeries: series,
    upgradeRequiredCount: series.filter(
      (usage) =>
        usage.remediationType === "update_sdk" &&
        usage.actionLevel === "required",
    ).length,
    delayedOtelIngestionCount: series.filter(
      (usage) =>
        usage.remediationType === "update_otel_instrumentation" &&
        usage.actionLevel === "required",
    ).length,
  };
};

describe("V4MigrationDelayBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.v4UpgradeUiEnabled = true;
    mocks.forceV3 = false;
    mocks.isV4 = false;
    mocks.projectId = "project-1";
    setSdk("latest", [makeSdkUsageSeries({})]);
  });

  it("stays hidden when every ingestion path is clean", () => {
    render(<V4MigrationDelayBadge page="traces" />);
    expect(screen.queryByText("New data in ~15 min")).not.toBeInTheDocument();
  });

  it("shows SDK copy for outdated SDK traffic", () => {
    setSdk("legacy", [outdatedSdkSeries()]);
    render(<V4MigrationDelayBadge page="traces" />);
    expect(screen.getAllByText("New data in ~15 min").length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getAllByText(/Update your SDK for real-time data/).length,
    ).toBeGreaterThan(0);
  });

  it("shows OTel copy for delayed OTel exporters", () => {
    setSdk("otel_header_required", [delayedOtelSeries()]);
    render(<V4MigrationDelayBadge page="traces" />);
    expect(
      screen.getAllByText(/Update your OTel instrumentation for real-time data/)
        .length,
    ).toBeGreaterThan(0);
  });

  it("shows instrumentation copy for headerless ingestion traffic", () => {
    setSdk("unknown", [customIngestionSeries()]);
    render(<V4MigrationDelayBadge page="traces" />);
    expect(
      screen.getAllByText(/Upgrade your instrumentation for real-time data/)
        .length,
    ).toBeGreaterThan(0);
  });

  it("shows the generic copy when several delayed paths fire", () => {
    setSdk("legacy", [outdatedSdkSeries(), delayedOtelSeries()]);
    render(<V4MigrationDelayBadge page="traces" />);
    expect(
      screen.getAllByText(/Upgrade to v4 for real-time data/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryAllByText(/Update your SDK for real-time data/),
    ).toHaveLength(0);
  });

  it("stays hidden when an SDK version is merely unrecognized", () => {
    // An unparsable version can still be a panel review item, but the delay
    // badge only fires for confirmed-outdated majors (upgradeRequiredCount).
    mocks.sdk = {
      status: "unknown",
      sdkUsageSeries: [
        makeSdkUsageSeries({
          sdkVersion: "not-semver",
          sdkVersionMajor: null,
          isValidSdkVersion: false,
          v4MigrationStatus: "unknown",
          actionLevel: "required",
        }),
      ],
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 0,
    };
    render(<V4MigrationDelayBadge page="traces" />);
    expect(screen.queryByText("New data in ~15 min")).not.toBeInTheDocument();
  });

  it("stays hidden while the check is still running", () => {
    setSdk("checking", []);
    render(<V4MigrationDelayBadge page="traces" />);
    expect(screen.queryByText("New data in ~15 min")).not.toBeInTheDocument();
  });

  it("stays hidden without the v4 upgrade UI flag", () => {
    mocks.v4UpgradeUiEnabled = false;
    setSdk("legacy", [outdatedSdkSeries()]);
    render(<V4MigrationDelayBadge page="traces" />);
    expect(screen.queryByText("New data in ~15 min")).not.toBeInTheDocument();
  });

  it("stays hidden for forced-v3 projects while they view v3", () => {
    // On v3 views the legacy tables are real-time — no delay to announce.
    mocks.forceV3 = true;
    mocks.isV4 = false;
    setSdk("legacy", [outdatedSdkSeries()]);
    render(<V4MigrationDelayBadge page="traces" />);
    expect(screen.queryByText("New data in ~15 min")).not.toBeInTheDocument();
  });

  it("opens the partner FAQ instead of the panel for forced-v3 projects on v4", () => {
    mocks.forceV3 = true;
    mocks.isV4 = true;
    setSdk("legacy", [outdatedSdkSeries()]);
    const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<V4MigrationDelayBadge page="traces" />);
    expect(
      screen.getAllByText(/Learn more in the docs/).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText("New data in ~15 min")[0]);
    expect(windowOpen).toHaveBeenCalledWith(
      expect.stringContaining("langfuse.com"),
      "_blank",
      "noopener,noreferrer",
    );
    expect(mocks.openMigrationPanel).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:delay_badge_clicked",
      { action: "docs", page: "traces" },
    );
    windowOpen.mockRestore();
  });

  describe("discoverability events", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    const hoveredCalls = () =>
      mocks.capture.mock.calls.filter(
        ([name]) => name === "v4_migration:delay_badge_hovered",
      );

    it("fires delay_badge_shown once per mount with the page dimension", () => {
      setSdk("legacy", [outdatedSdkSeries()]);
      const { rerender } = render(<V4MigrationDelayBadge page="traces" />);
      rerender(<V4MigrationDelayBadge page="traces" />);
      expect(
        mocks.capture.mock.calls.filter(
          ([name]) => name === "v4_migration:delay_badge_shown",
        ),
      ).toEqual([["v4_migration:delay_badge_shown", { page: "traces" }]]);
    });

    it("does not fire delay_badge_shown while the badge is hidden", () => {
      setSdk("checking", []);
      render(<V4MigrationDelayBadge page="traces" />);
      expect(mocks.capture).not.toHaveBeenCalled();
    });

    it("fires delay_badge_hovered once after the dwell threshold", () => {
      vi.useFakeTimers();
      setSdk("legacy", [outdatedSdkSeries()]);
      render(<V4MigrationDelayBadge page="observations" />);
      const badge = screen.getByRole("button");

      fireEvent.mouseEnter(badge);
      vi.advanceTimersByTime(500);
      fireEvent.mouseLeave(badge);
      // A later hover on the same mount must not double-count.
      fireEvent.mouseEnter(badge);
      vi.advanceTimersByTime(500);

      expect(hoveredCalls()).toEqual([
        ["v4_migration:delay_badge_hovered", { page: "observations" }],
      ]);
    });

    it("does not count a drive-by hover shorter than the dwell", () => {
      vi.useFakeTimers();
      setSdk("legacy", [outdatedSdkSeries()]);
      render(<V4MigrationDelayBadge page="traces" />);
      const badge = screen.getByRole("button");

      fireEvent.mouseEnter(badge);
      vi.advanceTimersByTime(300);
      fireEvent.mouseLeave(badge);
      vi.advanceTimersByTime(1000);

      expect(hoveredCalls()).toHaveLength(0);
    });

    it("fires delay_badge_shown again when the project changes in place", () => {
      setSdk("legacy", [outdatedSdkSeries()]);
      const { rerender } = render(<V4MigrationDelayBadge page="traces" />);
      // The project switcher navigates within the same route, so the badge is
      // reconciled (not remounted) while the new project's SDK check runs.
      setSdk("checking", []);
      mocks.projectId = "project-2";
      rerender(<V4MigrationDelayBadge page="traces" />);
      setSdk("legacy", [outdatedSdkSeries()]);
      rerender(<V4MigrationDelayBadge page="traces" />);
      expect(
        mocks.capture.mock.calls.filter(
          ([name]) => name === "v4_migration:delay_badge_shown",
        ),
      ).toHaveLength(2);
    });

    it("does not count a hover that ends in a click", () => {
      vi.useFakeTimers();
      setSdk("legacy", [outdatedSdkSeries()]);
      render(<V4MigrationDelayBadge page="traces" />);
      const badge = screen.getByRole("button");

      fireEvent.mouseEnter(badge);
      vi.advanceTimersByTime(300);
      // Also the touch path: a tap synthesizes mouseenter + click and never
      // delivers a mouseleave to cancel the dwell timer.
      fireEvent.click(badge);
      vi.advanceTimersByTime(1000);

      expect(hoveredCalls()).toHaveLength(0);
    });

    it("cancels a pending dwell when the badge hides without unmounting", () => {
      vi.useFakeTimers();
      setSdk("legacy", [outdatedSdkSeries()]);
      const { rerender } = render(<V4MigrationDelayBadge page="traces" />);
      fireEvent.mouseEnter(screen.getByRole("button"));
      vi.advanceTimersByTime(300);
      // React removes the button without a mouseleave when the SDK check
      // turns transient mid-hover.
      setSdk("checking", []);
      rerender(<V4MigrationDelayBadge page="traces" />);
      vi.advanceTimersByTime(1000);

      expect(hoveredCalls()).toHaveLength(0);
    });

    it("does not count a re-hover after the badge was clicked", () => {
      vi.useFakeTimers();
      setSdk("legacy", [outdatedSdkSeries()]);
      render(<V4MigrationDelayBadge page="traces" />);
      const badge = screen.getByRole("button");

      // `hovered` counts noticed-but-NOT-clicked: once the user clicked,
      // later dwells on the same exposure must not file them under it.
      fireEvent.click(badge);
      fireEvent.mouseEnter(badge);
      vi.advanceTimersByTime(1000);

      expect(hoveredCalls()).toHaveLength(0);
    });

    it("re-arms hovered when the user returns to a project in place", () => {
      vi.useFakeTimers();
      setSdk("legacy", [outdatedSdkSeries()]);
      const { rerender } = render(<V4MigrationDelayBadge page="traces" />);
      const dwell = () => {
        fireEvent.mouseEnter(screen.getByRole("button"));
        vi.advanceTimersByTime(500);
        fireEvent.mouseLeave(screen.getByRole("button"));
      };

      dwell();
      // Switch away and back without unmounting (the project switcher stays
      // on the route). The return re-fires `shown` as a new exposure, so a
      // fresh dwell must count again — otherwise the pair drifts apart.
      mocks.projectId = "project-2";
      rerender(<V4MigrationDelayBadge page="traces" />);
      mocks.projectId = "project-1";
      rerender(<V4MigrationDelayBadge page="traces" />);
      dwell();

      expect(hoveredCalls()).toHaveLength(2);
    });

    it("counts a keyboard focus dwell as hovered", () => {
      vi.useFakeTimers();
      setSdk("legacy", [outdatedSdkSeries()]);
      render(<V4MigrationDelayBadge page="traces" />);

      // The description also expands via group-focus-visible, so a keyboard
      // reveal counts as noticing the badge.
      fireEvent.focus(screen.getByRole("button"));
      vi.advanceTimersByTime(500);

      expect(hoveredCalls()).toEqual([
        ["v4_migration:delay_badge_hovered", { page: "traces" }],
      ]);
    });

    it("carries the page dimension on delay_badge_clicked", () => {
      setSdk("legacy", [outdatedSdkSeries()]);
      render(<V4MigrationDelayBadge page="observations" />);
      fireEvent.click(screen.getAllByText("New data in ~15 min")[0]);
      expect(mocks.capture).toHaveBeenCalledWith(
        "v4_migration:delay_badge_clicked",
        { page: "observations" },
      );
    });
  });
});

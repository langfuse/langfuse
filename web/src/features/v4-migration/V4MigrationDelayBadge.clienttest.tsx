import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { V4MigrationDelayBadge } from "./V4MigrationDelayBadge";
import {
  type V4MigrationSdkState,
  type V4MigrationSdkUsageSeries,
} from "./sdkVersionStatus";

const makeSdkUsageSeries = (
  overrides: Partial<V4MigrationSdkUsageSeries>,
): V4MigrationSdkUsageSeries => ({
  sdkName: "python",
  sdkVersion: "4.7.1",
  canonicalSdkName: "python",
  publicKey: "pk-lf-1234567890abcdef",
  count: 10,
  eventsCount: 10,
  firstSeen: "2026-07-20T10:00:00Z",
  lastSeen: "2026-07-23T10:00:00Z",
  hasDelayedOtelEvents: null,
  attributionStatus: "attributed",
  v4MigrationStatus: "compatible",
  ...overrides,
});

const outdatedSdkSeries = () =>
  makeSdkUsageSeries({
    sdkVersion: "2.60.3",
    v4MigrationStatus: "upgrade_required",
  });

const delayedOtelSeries = () =>
  makeSdkUsageSeries({
    sdkName: "openlit",
    canonicalSdkName: null,
    v4MigrationStatus: "unknown",
    hasDelayedOtelEvents: true,
    publicKey: "pk-lf-otel-1234567890",
  });

const customIngestionSeries = () =>
  makeSdkUsageSeries({
    sdkName: "unknown",
    sdkVersion: "unknown",
    canonicalSdkName: null,
    attributionStatus: "missing_name_and_version",
    v4MigrationStatus: "unknown",
    hasDelayedOtelEvents: null,
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
  isBetaEnabled: false,
  openMigrationPanel: vi.fn(),
}));

vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiEnabled: () => mocks.v4UpgradeUiEnabled,
  useV4UpgradeUiFlag: () => mocks.v4UpgradeUiEnabled,
}));

vi.mock("@/src/features/v4-migration/useForceV3Experience", () => ({
  useForceV3Experience: () => mocks.forceV3,
}));

vi.mock("@/src/features/events/hooks/useV4Beta", () => ({
  useV4Beta: () => ({ isBetaEnabled: mocks.isBetaEnabled }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProject: () => ({
    project: { id: "project-1", name: "Project One" },
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
  useCanUseInAppAgent: () => false,
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
      (usage) => usage.v4MigrationStatus === "upgrade_required",
    ).length,
    delayedOtelIngestionCount: series.filter(
      (usage) =>
        usage.canonicalSdkName === null && usage.hasDelayedOtelEvents === true,
    ).length,
  };
};

describe("V4MigrationDelayBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.v4UpgradeUiEnabled = true;
    mocks.forceV3 = false;
    mocks.isBetaEnabled = false;
    setSdk("latest", [makeSdkUsageSeries({})]);
  });

  it("stays hidden when every ingestion path is clean", () => {
    render(<V4MigrationDelayBadge />);
    expect(screen.queryByText("New data in ~15 min")).not.toBeInTheDocument();
  });

  it("shows SDK copy for outdated SDK traffic", () => {
    setSdk("legacy", [outdatedSdkSeries()]);
    render(<V4MigrationDelayBadge />);
    expect(screen.getAllByText("New data in ~15 min").length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getAllByText(/Update your SDK for real-time data/).length,
    ).toBeGreaterThan(0);
  });

  it("shows OTel copy for delayed OTel exporters", () => {
    setSdk("otel_header_required", [delayedOtelSeries()]);
    render(<V4MigrationDelayBadge />);
    expect(
      screen.getAllByText(/Update your OTel instrumentation for real-time data/)
        .length,
    ).toBeGreaterThan(0);
  });

  it("shows instrumentation copy for headerless ingestion traffic", () => {
    setSdk("unknown", [customIngestionSeries()]);
    render(<V4MigrationDelayBadge />);
    expect(
      screen.getAllByText(/Upgrade your instrumentation for real-time data/)
        .length,
    ).toBeGreaterThan(0);
  });

  it("shows the generic copy when several delayed paths fire", () => {
    setSdk("legacy", [outdatedSdkSeries(), delayedOtelSeries()]);
    render(<V4MigrationDelayBadge />);
    expect(
      screen.getAllByText(/Upgrade to v4 for real-time data/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryAllByText(/Update your SDK for real-time data/),
    ).toHaveLength(0);
  });

  it("stays hidden when an SDK version is merely unrecognized", () => {
    // An unparsable version puts the series in the panel's Update SDK
    // section for review, but is no proof of delayed ingestion.
    setSdk("unknown", [
      makeSdkUsageSeries({
        sdkVersion: "not-semver",
        v4MigrationStatus: "unknown",
      }),
    ]);
    render(<V4MigrationDelayBadge />);
    expect(screen.queryByText("New data in ~15 min")).not.toBeInTheDocument();
  });

  it("stays hidden while the check is still running", () => {
    setSdk("checking", []);
    render(<V4MigrationDelayBadge />);
    expect(screen.queryByText("New data in ~15 min")).not.toBeInTheDocument();
  });

  it("stays hidden without the v4 upgrade UI flag", () => {
    mocks.v4UpgradeUiEnabled = false;
    setSdk("legacy", [outdatedSdkSeries()]);
    render(<V4MigrationDelayBadge />);
    expect(screen.queryByText("New data in ~15 min")).not.toBeInTheDocument();
  });

  it("stays hidden for forced-v3 projects while they view v3", () => {
    // On v3 views the legacy tables are real-time — no delay to announce.
    mocks.forceV3 = true;
    mocks.isBetaEnabled = false;
    setSdk("legacy", [outdatedSdkSeries()]);
    render(<V4MigrationDelayBadge />);
    expect(screen.queryByText("New data in ~15 min")).not.toBeInTheDocument();
  });

  it("opens the partner FAQ instead of the panel for forced-v3 projects on v4", () => {
    mocks.forceV3 = true;
    mocks.isBetaEnabled = true;
    setSdk("legacy", [outdatedSdkSeries()]);
    const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<V4MigrationDelayBadge />);
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
    windowOpen.mockRestore();
  });
});

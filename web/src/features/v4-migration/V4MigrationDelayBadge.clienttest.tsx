import { render, screen } from "@testing-library/react";
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
  firstSeen: "2026-07-20T10:00:00Z",
  lastSeen: "2026-07-23T10:00:00Z",
  hasDelayedOtelEvents: null,
  attributionStatus: "attributed",
  v4MigrationStatus: "compatible",
  upgradeCompleted: false,
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
  openMigrationPanel: vi.fn(),
}));

vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiEnabled: () => mocks.v4UpgradeUiEnabled,
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
      (usage) =>
        usage.v4MigrationStatus === "upgrade_required" &&
        !usage.upgradeCompleted,
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
      screen.getAllByText(/Update SDK for real-time data/).length,
    ).toBeGreaterThan(0);
  });

  it("shows OTel copy for delayed OTel exporters", () => {
    setSdk("otel_header_required", [delayedOtelSeries()]);
    render(<V4MigrationDelayBadge />);
    expect(
      screen.getAllByText(/Update OTel instrumentation for real-time data/)
        .length,
    ).toBeGreaterThan(0);
  });

  it("shows instrumentation copy for headerless ingestion traffic", () => {
    setSdk("unknown", [customIngestionSeries()]);
    render(<V4MigrationDelayBadge />);
    expect(
      screen.getAllByText(/Upgrade instrumentation for real-time data/).length,
    ).toBeGreaterThan(0);
  });

  it("shows the generic copy when several delayed paths fire", () => {
    setSdk("legacy", [outdatedSdkSeries(), delayedOtelSeries()]);
    render(<V4MigrationDelayBadge />);
    expect(
      screen.getAllByText(/Upgrade for real-time data/).length,
    ).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Update SDK for real-time data/)).toHaveLength(
      0,
    );
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
});

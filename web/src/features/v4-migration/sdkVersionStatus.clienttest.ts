import {
  formatSdkVersion,
  getV4MigrationSdkState,
  type V4MigrationSdkUsageSeries,
} from "@/src/features/v4-migration/sdkVersionStatus";

const sdkSeries = (
  overrides: Partial<V4MigrationSdkUsageSeries> = {},
): V4MigrationSdkUsageSeries => ({
  sdkName: "python",
  sdkVersion: "4.7.0",
  canonicalSdkName: "python" as const,
  publicKey: "pk-lf-python",
  count: 1,
  firstSeen: "2026-07-23T09:00:00Z",
  lastSeen: "2026-07-23T10:00:00Z",
  hasDelayedOtelEvents: false,
  attributionStatus: "attributed" as const,
  v4MigrationStatus: "compatible" as const,
  upgradeCompleted: false,
  ...overrides,
});

const getLoadedSdkState = (...sdkUsageSeries: ReturnType<typeof sdkSeries>[]) =>
  getV4MigrationSdkState({
    summary: {
      projectId: "project-1",
      outdatedSdkUsageSeriesCount: 0,
      delayedOtelIngestionSeriesCount: 0,
      sdkUsageSeries,
    },
    isError: false,
    isLoading: false,
  });

describe("v4 migration SDK status", () => {
  it("requires an upgrade when any detected SDK series is incompatible", () => {
    expect(
      getLoadedSdkState(
        sdkSeries(),
        sdkSeries({
          sdkVersion: "4.6.9",
          publicKey: "pk-lf-old-python",
          v4MigrationStatus: "upgrade_required",
        }),
      ),
    ).toMatchObject({
      status: "legacy",
      upgradeRequiredCount: 1,
    });
  });

  it("does not require action for raw OTel already using real-time ingestion", () => {
    expect(
      getLoadedSdkState(
        sdkSeries(),
        sdkSeries({
          sdkName: "unknown",
          sdkVersion: "unknown",
          canonicalSdkName: null,
          publicKey: "",
          attributionStatus: "missing_name_and_version",
          v4MigrationStatus: "unknown",
          hasDelayedOtelEvents: false,
        }),
      ),
    ).toMatchObject({
      status: "latest",
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 0,
    });
  });

  it("requires the ingestion header for delayed raw OTel traffic", () => {
    expect(
      getLoadedSdkState(
        sdkSeries(),
        sdkSeries({
          sdkName: "unknown",
          sdkVersion: "unknown",
          canonicalSdkName: null,
          publicKey: "",
          attributionStatus: "missing_name_and_version",
          v4MigrationStatus: "unknown",
          hasDelayedOtelEvents: true,
        }),
      ),
    ).toMatchObject({
      status: "otel_header_required",
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 1,
    });
  });

  it("does not require action for an SDK series superseded by a clean upgrade", () => {
    expect(
      getLoadedSdkState(
        sdkSeries({
          sdkVersion: "4.6.9",
          v4MigrationStatus: "upgrade_required",
          upgradeCompleted: true,
        }),
        sdkSeries(),
      ),
    ).toMatchObject({
      status: "latest",
      upgradeRequiredCount: 0,
    });
  });

  it("keeps a recognized SDK with an invalid version unknown", () => {
    expect(
      getLoadedSdkState(
        sdkSeries({
          sdkVersion: "invalid",
          v4MigrationStatus: "unknown",
        }),
      ),
    ).toMatchObject({ status: "unknown" });
  });

  it("distinguishes loading, errors, and a loaded empty result", () => {
    expect(
      getV4MigrationSdkState({
        summary: undefined,
        isLoading: true,
        isError: false,
      }).status,
    ).toBe("checking");
    expect(
      getV4MigrationSdkState({
        summary: undefined,
        isLoading: false,
        isError: true,
      }).status,
    ).toBe("error");
    expect(getLoadedSdkState().status).toBe("unknown");
  });

  it("formats detected SDK versions for migration copy", () => {
    expect(formatSdkVersion({ language: "javascript", version: "5.4.1" })).toBe(
      "JavaScript 5.4.1",
    );
    expect(formatSdkVersion({ language: null, version: null })).toBeNull();
  });
});

import {
  formatSdkUpgradeRequirement,
  formatSdkVersion,
  getCustomInstrumentationSectionState,
  getDetectedInstrumentationSeries,
  getOtelSectionState,
  getSdkSectionState,
  getV4MigrationSdkState,
  type V4MigrationSdkUsageSeries,
} from "@/src/features/v4-migration/sdkVersionStatus";

const sdkSeries = (
  overrides: Partial<V4MigrationSdkUsageSeries> = {},
): V4MigrationSdkUsageSeries => {
  const source = overrides.source ?? "ingestion-api-dual-write";
  const ingestionPath =
    overrides.ingestionPath ??
    (source === "ingestion-api-dual-write" ? "ingestion_api" : "otel");
  const deliveryMode =
    overrides.deliveryMode ?? (source === "otel" ? "realtime" : "delayed");
  const sdkName = overrides.sdkName ?? "python";
  const sdkVersion = overrides.sdkVersion ?? "4.7.0";
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
    publicKey: overrides.publicKey ?? "pk-lf-python",
    eventCount: overrides.eventCount ?? 1,
    firstSeen: overrides.firstSeen ?? "2026-07-23T09:00:00Z",
    lastSeen: overrides.lastSeen ?? "2026-07-23T10:00:00Z",
    attributionStatus: overrides.attributionStatus ?? "attributed",
    v4MigrationStatus,
    remediationType,
    actionLevel,
  };
};

const delayedOtelSeries = (
  overrides: Partial<V4MigrationSdkUsageSeries> = {},
) =>
  sdkSeries({
    source: "otel-dual-write",
    sdkName: "unknown",
    sdkVersion: "unknown",
    canonicalSdkName: null,
    publicKey: "",
    attributionStatus: "missing_name_and_version",
    ...overrides,
  });

const realtimeOtelSeries = (
  overrides: Partial<V4MigrationSdkUsageSeries> = {},
) =>
  sdkSeries({
    source: "otel",
    sdkName: "unknown",
    sdkVersion: "unknown",
    canonicalSdkName: null,
    publicKey: "",
    attributionStatus: "missing_name_and_version",
    ...overrides,
  });

const customIngestionSeries = (
  overrides: Partial<V4MigrationSdkUsageSeries> = {},
) =>
  sdkSeries({
    source: "ingestion-api-dual-write",
    sdkName: "unknown",
    sdkVersion: "unknown",
    canonicalSdkName: null,
    publicKey: "pk-lf-custom",
    attributionStatus: "missing_name_and_version",
    ...overrides,
  });

const getLoadedSdkState = (...sdkUsageSeries: ReturnType<typeof sdkSeries>[]) =>
  getV4MigrationSdkState({
    summary: {
      projectId: "project-1",
      experimentInstrumentationMigration: {
        status: "not_required",
        upgradePath: null,
      },
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
          sdkVersion: "3.9.0",
          publicKey: "pk-lf-old-python",
        }),
      ),
    ).toMatchObject({
      status: "legacy",
      upgradeRequiredCount: 1,
    });
    expect(
      getSdkSectionState(
        getLoadedSdkState(
          sdkSeries(),
          sdkSeries({
            sdkVersion: "3.9.0",
            publicKey: "pk-lf-old-python",
          }),
        ),
      ),
    ).toMatchObject({
      status: "legacy",
      actionableCount: 1,
    });
  });

  it("treats current-major SDKs as compatible with no action", () => {
    const state = getLoadedSdkState(
      sdkSeries({
        sdkVersion: "4.6.9",
      }),
    );

    expect(state).toMatchObject({
      status: "latest",
      upgradeRequiredCount: 0,
    });
    expect(getSdkSectionState(state)).toMatchObject({
      status: "no_data",
      actionableCount: 0,
    });
    expect(getDetectedInstrumentationSeries(state)).toEqual([
      expect.objectContaining({
        sdkVersion: "4.6.9",
        actionLevel: "none",
        remediationType: "update_sdk",
      }),
    ]);
  });

  it("orders SDK usage by most recent last seen", () => {
    const state = getLoadedSdkState(
      sdkSeries({
        sdkVersion: "3.9.0",
        publicKey: "pk-lf-older-outdated",
        lastSeen: "2026-07-22T10:00:00Z",
      }),
      sdkSeries({
        publicKey: "pk-lf-newer-compatible",
        lastSeen: "2026-07-23T10:00:00Z",
      }),
    );

    expect(state.sdkUsageSeries.map((series) => series.publicKey)).toEqual([
      "pk-lf-newer-compatible",
      "pk-lf-older-outdated",
    ]);
  });

  it("does not require action for raw OTel already using real-time ingestion", () => {
    const state = getLoadedSdkState(realtimeOtelSeries());
    expect(state).toMatchObject({
      status: "otel_realtime",
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 0,
    });
    expect(getOtelSectionState(state).delayedCount).toBe(0);
    expect(getDetectedInstrumentationSeries(state)).toEqual([
      expect.objectContaining({
        source: "otel",
        deliveryMode: "realtime",
        actionLevel: "none",
      }),
    ]);
  });

  it("requires the ingestion header for delayed raw OTel traffic", () => {
    expect(getLoadedSdkState(sdkSeries(), delayedOtelSeries())).toMatchObject({
      status: "otel_header_required",
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 1,
    });
  });

  it("requires action when an outdated SDK was used within the lookback window", () => {
    expect(
      getLoadedSdkState(
        sdkSeries({
          sdkVersion: "3.9.0",
        }),
        sdkSeries(),
      ),
    ).toMatchObject({
      status: "legacy",
      upgradeRequiredCount: 1,
    });
  });

  it("keeps custom-instrumentation traffic action-needed despite a compatible SDK", () => {
    expect(
      getLoadedSdkState(sdkSeries(), customIngestionSeries()),
    ).toMatchObject({ status: "unknown" });
    expect(
      getCustomInstrumentationSectionState(
        getLoadedSdkState(sdkSeries(), customIngestionSeries()),
      ).series,
    ).toHaveLength(1);
  });

  it("treats a recognized SDK with an invalid version as requiring action", () => {
    // SQL marks invalid versions upgrade-unknown with actionLevel required, so
    // the combined status follows the upgradeRequiredCount → legacy path.
    expect(
      getLoadedSdkState(
        sdkSeries({
          sdkVersion: "invalid",
          sdkVersionMajor: null,
          isValidSdkVersion: false,
          v4MigrationStatus: "unknown",
          actionLevel: "required",
        }),
      ),
    ).toMatchObject({
      status: "legacy",
      upgradeRequiredCount: 1,
    });
  });

  it("distinguishes loading, errors, and a loaded result with no data", () => {
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
    expect(getLoadedSdkState().status).toBe("no_data");
  });

  it("formats detected SDK versions for migration copy", () => {
    expect(formatSdkVersion({ language: "javascript", version: "5.4.1" })).toBe(
      "JavaScript 5.4.1",
    );
    expect(formatSdkVersion({ language: null, version: null })).toBeNull();
  });

  it.each([
    [5, "upgrade required to >= 5.0.0"],
    [4, "upgrade required to >= 4.0.0"],
    [null, "upgrade required"],
  ] as const)(
    "formats latest major %s as upgrade guidance",
    (latestSdkMajor, expected) => {
      expect(formatSdkUpgradeRequirement(latestSdkMajor)).toBe(expected);
    },
  );
});

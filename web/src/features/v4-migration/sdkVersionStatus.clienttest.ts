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
  lastSeen: "2026-07-23T10:00:00Z",
  v4MigrationStatus: "compatible" as const,
  ...overrides,
});

const getLoadedSdkState = (...sdkUsageSeries: ReturnType<typeof sdkSeries>[]) =>
  getV4MigrationSdkState({
    summary: {
      projectId: "project-1",
      outdatedSdkUsageSeriesCount: 0,
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

  it("does not let unattributed usage override a compatible SDK", () => {
    expect(
      getLoadedSdkState(
        sdkSeries(),
        sdkSeries({
          sdkName: "unknown",
          sdkVersion: "unknown",
          canonicalSdkName: null,
          publicKey: "",
          v4MigrationStatus: "unknown",
        }),
      ),
    ).toMatchObject({ status: "latest", upgradeRequiredCount: 0 });
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

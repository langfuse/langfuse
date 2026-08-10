import {
  aggregateLegacyApiUsage,
  createV4MigrationDetectionRange,
  getLegacyIntegrationLabels,
  getMigrationActionState,
  getMigrationCountState,
  getProjectMigrationReadiness,
  type ProjectMigrationStatus,
} from "@/src/features/v4-migration/migrationData";

const loaded = (count: number) => ({ status: "loaded" as const, count });
const loadedAction = (
  result: "required" | "not_required" | "sdk_usage_inconclusive",
) => ({ status: "loaded" as const, result });
const migrationStatus = (
  overrides: Partial<ProjectMigrationStatus> = {},
): ProjectMigrationStatus => ({
  sdk: {
    status: "latest",
    sdkUsageSeries: [],
    upgradeRequiredCount: 0,
    delayedOtelIngestionCount: 0,
  },
  evals: loaded(0),
  experiments: loadedAction("not_required"),
  apis: loaded(0),
  exports: loaded(0),
  ...overrides,
});

describe("v4 migration data", () => {
  it("uses a stable fourteen-day range aligned to the hour", () => {
    const range = createV4MigrationDetectionRange(
      new Date("2026-07-23T10:42:31.000Z").getTime(),
    );

    expect(range).toEqual({
      fromTimestamp: new Date("2026-07-09T11:00:00.000Z"),
      toTimestamp: new Date("2026-07-23T11:00:00.000Z"),
    });
  });

  it("keeps loading and errors distinct from a real zero", () => {
    expect(getMigrationCountState(null, () => 4)).toEqual({
      status: "loading",
      count: 0,
    });
    expect(
      getMigrationCountState({ data: undefined, isError: true }, () => 4),
    ).toEqual({ status: "error", count: 0 });
    expect(
      getMigrationCountState({ data: { count: 0 }, isError: false }, (data) => {
        return data.count;
      }),
    ).toEqual(loaded(0));
    expect(getMigrationActionState(null, () => "required")).toEqual({
      status: "loading",
      result: null,
    });
    expect(
      getMigrationActionState(
        { data: { result: "required" as const }, isError: false },
        (data) => data.result,
      ),
    ).toEqual(loadedAction("required"));
    expect(
      getMigrationActionState(
        { data: { result: "check_failed" as const }, isError: false },
        (data) => data.result,
      ),
    ).toEqual({ status: "error", result: null });
  });

  it("only marks a fully loaded project without affected items as ready", () => {
    expect(getProjectMigrationReadiness(migrationStatus())).toBe("ready");
    expect(
      getProjectMigrationReadiness(
        migrationStatus({
          sdk: {
            ...migrationStatus().sdk,
            status: "otel_realtime",
          },
        }),
      ),
    ).toBe("ready");
    expect(
      getProjectMigrationReadiness(
        migrationStatus({
          sdk: {
            ...migrationStatus().sdk,
            status: "no_data",
          },
        }),
      ),
    ).toBe("ready");
    expect(
      getProjectMigrationReadiness(migrationStatus({ evals: loaded(1) })),
    ).toBe("action-needed");
    expect(
      getProjectMigrationReadiness(
        migrationStatus({ experiments: loadedAction("required") }),
      ),
    ).toBe("action-needed");
    expect(
      getProjectMigrationReadiness(
        migrationStatus({
          experiments: loadedAction("sdk_usage_inconclusive"),
        }),
      ),
    ).toBe("action-needed");
    expect(
      getProjectMigrationReadiness(
        migrationStatus({ evals: { status: "loading", count: 0 } }),
      ),
    ).toBe("checking");
    expect(
      getProjectMigrationReadiness(
        migrationStatus({
          sdk: {
            status: "error",
            sdkUsageSeries: [],
            upgradeRequiredCount: 0,
            delayedOtelIngestionCount: 0,
          },
        }),
      ),
    ).toBe("unavailable");
  });

  it("aggregates real API usage by normalized endpoint", () => {
    expect(
      aggregateLegacyApiUsage([
        {
          time: "2026-07-23T09:00:00Z",
          entrypoint: "publicapi: GET /api/public/traces",
          count: 2,
          lastSeen: "2026-07-23T09:42:00Z",
        },
        {
          time: "2026-07-23T10:00:00Z",
          entrypoint: "publicapi: GET /api/public/traces",
          count: 3,
          lastSeen: "2026-07-23T10:37:00Z",
        },
        {
          time: "2026-07-23T10:00:00Z",
          entrypoint: "",
          count: 0,
          lastSeen: null,
        },
      ]),
    ).toEqual([
      {
        endpoint: "GET /api/public/traces",
        count: 5,
        lastSeen: "2026-07-23T10:37:00Z",
      },
    ]);
  });

  it("returns only enabled legacy integration labels", () => {
    expect(
      getLegacyIntegrationLabels({
        posthog: true,
        mixpanel: false,
        blobStorage: true,
      }),
    ).toEqual(["PostHog", "Blob Storage"]);
  });
});

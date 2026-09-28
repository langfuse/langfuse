import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ClickHouseSettings } from "@clickhouse/client";

type ExtraSettings = Record<string, string | number | boolean> | undefined;

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  close: vi.fn(async () => undefined),
  env: {
    CLICKHOUSE_URL: "http://localhost:8123",
    CLICKHOUSE_READ_ONLY_URL: undefined as string | undefined,
    CLICKHOUSE_EVENTS_READ_ONLY_URL: undefined as string | undefined,
    CLICKHOUSE_USER: "default",
    CLICKHOUSE_PASSWORD: "",
    CLICKHOUSE_DB: "default",
    LANGFUSE_JSON_BAD_UNICODE_ESCAPE: undefined as
      | "auto"
      | "no_throw"
      | "sanitize"
      | undefined,
    CLICKHOUSE_KEEP_ALIVE_IDLE_SOCKET_TTL: 9000,
    CLICKHOUSE_MAX_OPEN_CONNECTIONS: 25,
    CLICKHOUSE_ASYNC_INSERT_MAX_DATA_SIZE: undefined,
    CLICKHOUSE_ASYNC_INSERT_BUSY_TIMEOUT_MS: undefined,
    CLICKHOUSE_ASYNC_INSERT_BUSY_TIMEOUT_MIN_MS: undefined,
    CLICKHOUSE_LIGHTWEIGHT_DELETE_MODE: "alter_update",
    CLICKHOUSE_UPDATE_PARALLEL_MODE: "auto",
    CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION: "auto",
    CLICKHOUSE_DISABLE_TOP_K_THROUGH_JOIN: "auto",
    CLICKHOUSE_EXTRA_SETTINGS: undefined as ExtraSettings,
    CLICKHOUSE_EXTRA_SETTINGS_READ_ONLY: undefined as ExtraSettings,
    CLICKHOUSE_EXTRA_SETTINGS_EVENTS_READ_ONLY: undefined as ExtraSettings,
    LANGFUSE_LOG_LEVEL: "error",
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
  },
}));

vi.mock("../../env", () => ({ env: mocks.env }));
vi.mock("@clickhouse/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clickhouse/client")>();

  return {
    ...actual,
    createClient: mocks.createClient,
  };
});

import {
  ClickHouseClientManager,
  clickhouseClient,
  resolveClickhouseService,
  type PreferredClickhouseService,
} from "./client";
import { setClickHouseCompatibilityVersionForTests } from "./compatibility";

describe("ClickHouseClientManager compatibility settings", () => {
  beforeEach(async () => {
    await ClickHouseClientManager.getInstance().closeAllConnections();
    mocks.env.LANGFUSE_JSON_BAD_UNICODE_ESCAPE = undefined;

    mocks.close.mockClear();
    mocks.createClient.mockReset();
    mocks.createClient.mockReturnValue({ close: mocks.close });
    mocks.env.CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION = "auto";
    mocks.env.CLICKHOUSE_DISABLE_TOP_K_THROUGH_JOIN = "auto";
    mocks.env.CLICKHOUSE_EXTRA_SETTINGS = undefined;
    mocks.env.CLICKHOUSE_EXTRA_SETTINGS_READ_ONLY = undefined;
    mocks.env.CLICKHOUSE_EXTRA_SETTINGS_EVENTS_READ_ONLY = undefined;
    setClickHouseCompatibilityVersionForTests(null);
  });

  it("applies resolved compatibility settings globally", () => {
    setClickHouseCompatibilityVersionForTests("26.5.5.8");

    clickhouseClient();

    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(
      mocks.createClient.mock.calls[0][0].clickhouse_settings,
    ).toMatchObject({
      query_plan_top_k_through_join: 0,
    });
  });

  it("lets explicit client settings override compatibility settings", () => {
    setClickHouseCompatibilityVersionForTests("26.5.5.8");

    clickhouseClient({
      clickhouse_settings: {
        query_plan_top_k_through_join: 1,
      } as ClickHouseSettings,
    });

    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(
      mocks.createClient.mock.calls[0][0].clickhouse_settings
        .query_plan_top_k_through_join,
    ).toBe(1);
  });

  it("sends no extra settings when unset", () => {
    clickhouseClient();

    expect(
      mocks.createClient.mock.calls[0][0].clickhouse_settings,
    ).not.toHaveProperty("use_skip_indexes_for_disjunctions");
  });

  it("applies extra settings to every client", () => {
    mocks.env.CLICKHOUSE_EXTRA_SETTINGS = {
      use_skip_indexes_for_disjunctions: "1",
    };

    clickhouseClient();
    clickhouseClient({}, "EventsReadOnly");

    expect(mocks.createClient).toHaveBeenCalledTimes(2);
    for (const [config] of mocks.createClient.mock.calls) {
      expect(config.clickhouse_settings).toMatchObject({
        use_skip_indexes_for_disjunctions: "1",
      });
    }
  });

  it.each([
    ["ReadWrite", undefined],
    ["ReadOnly", "read_only"],
    ["EventsReadOnly", "events_read_only"],
  ] as const)(
    "applies only the matching service extra settings to %s",
    (preferred, expectedMarker) => {
      mocks.env.CLICKHOUSE_EXTRA_SETTINGS_READ_ONLY = {
        log_comment: "read_only",
      };
      mocks.env.CLICKHOUSE_EXTRA_SETTINGS_EVENTS_READ_ONLY = {
        log_comment: "events_read_only",
      };

      clickhouseClient({}, preferred);

      expect(
        mocks.createClient.mock.calls[0][0].clickhouse_settings.log_comment,
      ).toBe(expectedMarker);
    },
  );

  it("lets derived and per-query settings override extra settings", () => {
    setClickHouseCompatibilityVersionForTests("26.5.5.8");
    mocks.env.CLICKHOUSE_EXTRA_SETTINGS = {
      query_plan_top_k_through_join: 1,
      max_execution_time: 1,
      date_time_output_format: "simple",
    };

    clickhouseClient({
      clickhouse_settings: { date_time_output_format: "iso" },
    });

    expect(
      mocks.createClient.mock.calls[0][0].clickhouse_settings,
    ).toMatchObject({
      query_plan_top_k_through_join: 0,
      max_execution_time: 35,
      date_time_output_format: "iso",
    });
  });

  it("uses a new cached client key after compatibility settings change", () => {
    clickhouseClient();
    setClickHouseCompatibilityVersionForTests("26.5.5.8");
    clickhouseClient();

    expect(mocks.createClient).toHaveBeenCalledTimes(2);
  });

  it("sets ClickHouse server timeout after the default client request timeout", () => {
    clickhouseClient();

    expect(
      mocks.createClient.mock.calls[0][0].clickhouse_settings,
    ).toMatchObject({
      timeout_before_checking_execution_speed: 0,
      max_execution_time: 35,
    });
  });

  it("sets ClickHouse server timeout just after the client request timeout", () => {
    clickhouseClient({ request_timeout: 120_000 });

    expect(
      mocks.createClient.mock.calls[0][0].clickhouse_settings,
    ).toMatchObject({
      timeout_before_checking_execution_speed: 0,
      max_execution_time: 125,
    });
  });

  it("uses a new cached client when response compression is enabled", () => {
    clickhouseClient();
    clickhouseClient({ compression: { response: true } });

    expect(mocks.createClient).toHaveBeenCalledTimes(2);
    expect(mocks.createClient.mock.calls[0][0].compression).toBeUndefined();
    expect(mocks.createClient.mock.calls[1][0].compression).toEqual({
      response: true,
    });
  });

  it("lets explicit client settings override derived timeout settings", () => {
    clickhouseClient({
      request_timeout: 120_000,
      clickhouse_settings: {
        timeout_before_checking_execution_speed: 10,
        max_execution_time: 60,
      } as ClickHouseSettings,
    });

    expect(
      mocks.createClient.mock.calls[0][0].clickhouse_settings,
    ).toMatchObject({
      timeout_before_checking_execution_speed: 10,
      max_execution_time: 60,
    });
  });

  it.each([
    ["no_throw", null, 0, "undefined"],
    ["auto", "24.3.0.0", undefined, "function"],
  ] as const)(
    "configures %s JSON handling",
    (
      mode,
      clickHouseVersion,
      expectedClickHouseSetting,
      expectedStringifyType,
    ) => {
      mocks.env.LANGFUSE_JSON_BAD_UNICODE_ESCAPE = mode;
      setClickHouseCompatibilityVersionForTests(clickHouseVersion);

      clickhouseClient();

      const config = mocks.createClient.mock.calls[0][0];
      expect(
        config.clickhouse_settings
          .input_format_json_throw_on_bad_escape_sequence,
      ).toBe(expectedClickHouseSetting);
      expect(typeof config.json?.stringify).toBe(expectedStringifyType);
    },
  );

  it("uses a new cached client when automatic JSON handling changes", () => {
    mocks.env.LANGFUSE_JSON_BAD_UNICODE_ESCAPE = "auto";
    const opts = {
      clickhouse_settings: {
        input_format_json_throw_on_bad_escape_sequence: 0,
      } as ClickHouseSettings,
    };

    clickhouseClient(opts);
    setClickHouseCompatibilityVersionForTests("24.4.0.0");
    clickhouseClient(opts);

    expect(mocks.createClient).toHaveBeenCalledTimes(2);
  });
});

describe("resolveClickhouseService", () => {
  const MAIN = "http://main:8123";
  const READ_REPLICA = "http://read-replica:8123";
  const EVENTS_READ_REPLICA = "http://events-read-replica:8123";

  beforeEach(async () => {
    await ClickHouseClientManager.getInstance().closeAllConnections();
    mocks.createClient.mockReset();
    mocks.createClient.mockReturnValue({ close: mocks.close });
  });

  // The label must name the node the client actually connects to, including
  // when an unset replica URL falls back to a less specific one.
  it.each<
    [
      PreferredClickhouseService | undefined,
      string | undefined,
      string | undefined,
      string,
      string,
    ]
  >([
    [undefined, READ_REPLICA, EVENTS_READ_REPLICA, "main", MAIN],
    ["ReadWrite", READ_REPLICA, EVENTS_READ_REPLICA, "main", MAIN],
    [
      "ReadOnly",
      READ_REPLICA,
      EVENTS_READ_REPLICA,
      "read_replica",
      READ_REPLICA,
    ],
    ["ReadOnly", undefined, EVENTS_READ_REPLICA, "main", MAIN],
    [
      "EventsReadOnly",
      READ_REPLICA,
      EVENTS_READ_REPLICA,
      "events_read_replica",
      EVENTS_READ_REPLICA,
    ],
    ["EventsReadOnly", READ_REPLICA, "", "read_replica", READ_REPLICA],
    ["EventsReadOnly", undefined, undefined, "main", MAIN],
  ])(
    "resolves %s (read_only=%s, events_read_only=%s) to %s",
    (
      preferred,
      readOnlyUrl,
      eventsReadOnlyUrl,
      expectedService,
      expectedUrl,
    ) => {
      const originalUrl = mocks.env.CLICKHOUSE_URL;
      mocks.env.CLICKHOUSE_URL = MAIN;
      mocks.env.CLICKHOUSE_READ_ONLY_URL = readOnlyUrl;
      mocks.env.CLICKHOUSE_EVENTS_READ_ONLY_URL = eventsReadOnlyUrl;
      try {
        expect(resolveClickhouseService(preferred)).toBe(expectedService);

        clickhouseClient({}, preferred);
        expect(mocks.createClient.mock.calls[0][0].url).toBe(expectedUrl);
      } finally {
        mocks.env.CLICKHOUSE_URL = originalUrl;
        mocks.env.CLICKHOUSE_READ_ONLY_URL = undefined;
        mocks.env.CLICKHOUSE_EVENTS_READ_ONLY_URL = undefined;
      }
    },
  );
});

describe("CLICKHOUSE_EXTRA_SETTINGS validation", () => {
  const loadEnv = async (value: string) => {
    vi.stubEnv("CLICKHOUSE_EXTRA_SETTINGS", value);
    vi.resetModules();
    try {
      return await vi.importActual<typeof import("../../env")>("../../env");
    } finally {
      vi.unstubAllEnvs();
    }
  };

  it("parses a JSON object of settings", async () => {
    const { env } = await loadEnv(
      '{"use_skip_indexes_for_disjunctions":"1","max_threads":4}',
    );

    expect(env.CLICKHOUSE_EXTRA_SETTINGS).toEqual({
      use_skip_indexes_for_disjunctions: "1",
      max_threads: 4,
    });
  });

  it.each([
    ["invalid JSON", "{use_skip_indexes_for_disjunctions:1}"],
    ["a non-object", '["max_threads"]'],
    ["a nested value", '{"max_threads":{"value":4}}'],
    ["an invalid setting name", '{"max threads":4}'],
  ])("rejects %s at startup", async (_, value) => {
    await expect(loadEnv(value)).rejects.toThrow("CLICKHOUSE_EXTRA_SETTINGS");
  });
});

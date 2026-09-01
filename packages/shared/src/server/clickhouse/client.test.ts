import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ClickHouseSettings } from "@clickhouse/client";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  close: vi.fn(async () => undefined),
  env: {
    CLICKHOUSE_URL: "http://localhost:8123",
    CLICKHOUSE_READ_ONLY_URL: undefined,
    CLICKHOUSE_EVENTS_READ_ONLY_URL: undefined,
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

import { ClickHouseClientManager, clickhouseClient } from "./client";
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

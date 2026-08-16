import { afterEach, describe, expect, it, vi } from "vitest";
import type { Redis } from "ioredis";

vi.mock("../../env", () => ({
  env: {
    REDIS_CLUSTER_ENABLED: "false",
    REDIS_ENABLE_AUTO_PIPELINING: "false",
    REDIS_SENTINEL_ENABLED: "false",
  },
}));

import { env } from "../../env";
import { safeMultiGet, scanKeys } from "./redis";

type ScanCall = [string, "MATCH", string, "COUNT", number];

const createRedisStub = (
  scanResults: Array<[string, string[]]>,
  options: { keyPrefix?: string } = {},
) => {
  let callIndex = 0;
  const scan = vi.fn(
    async (..._args: ScanCall): Promise<[string, string[]]> =>
      scanResults[callIndex++] ?? ["0", []],
  );

  return {
    client: { options, scan } as unknown as Redis,
    scan,
  };
};

describe("scanKeys", () => {
  it("scans every cursor page and returns unique keys", async () => {
    const { client, scan } = createRedisStub([
      ["42", ["cache:first", "cache:second"]],
      ["0", ["cache:second", "cache:third"]],
    ]);

    await expect(scanKeys(client, "cache:*")).resolves.toEqual([
      "cache:first",
      "cache:second",
      "cache:third",
    ]);

    expect(scan).toHaveBeenNthCalledWith(
      1,
      "0",
      "MATCH",
      "cache:*",
      "COUNT",
      1000,
    );
    expect(scan).toHaveBeenNthCalledWith(
      2,
      "42",
      "MATCH",
      "cache:*",
      "COUNT",
      1000,
    );
  });

  it("scans physical prefixed keys but returns logical keys", async () => {
    const { client, scan } = createRedisStub(
      [["0", ["tenant:api-key:first", "tenant:api-key:second"]]],
      { keyPrefix: "tenant:" },
    );

    await expect(scanKeys(client, "api-key:*")).resolves.toEqual([
      "api-key:first",
      "api-key:second",
    ]);

    expect(scan).toHaveBeenCalledWith(
      "0",
      "MATCH",
      "tenant:api-key:*",
      "COUNT",
      1000,
    );
  });
});

describe("safeMultiGet", () => {
  afterEach(() => {
    env.REDIS_CLUSTER_ENABLED = "false";
  });

  it("uses mget when cluster mode is disabled", async () => {
    env.REDIS_CLUSTER_ENABLED = "false";
    const mget = vi.fn(async () => ["a", null, "c"]);
    const get = vi.fn();
    const client = { mget, get } as unknown as Redis;

    await expect(safeMultiGet(client, ["k1", "k2", "k3"])).resolves.toEqual([
      "a",
      null,
      "c",
    ]);
    expect(mget).toHaveBeenCalledWith(["k1", "k2", "k3"]);
    expect(get).not.toHaveBeenCalled();
  });

  it("uses per-key get when cluster mode is enabled", async () => {
    env.REDIS_CLUSTER_ENABLED = "true";
    const mget = vi.fn();
    const get = vi.fn(async (key: string) => `value:${key}`);
    const client = { mget, get } as unknown as Redis;

    await expect(safeMultiGet(client, ["k1", "k2"])).resolves.toEqual([
      "value:k1",
      "value:k2",
    ]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(mget).not.toHaveBeenCalled();
  });

  it("returns an empty array for empty input", async () => {
    const client = { mget: vi.fn(), get: vi.fn() } as unknown as Redis;
    await expect(safeMultiGet(client, [])).resolves.toEqual([]);
  });
});

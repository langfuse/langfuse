import { describe, expect, it, vi } from "vitest";
import type { Redis } from "ioredis";

vi.mock("../../env", () => ({
  env: {
    REDIS_CLUSTER_ENABLED: "false",
    REDIS_ENABLE_AUTO_PIPELINING: "false",
    REDIS_SENTINEL_ENABLED: "false",
  },
}));

import { scanKeys } from "./redis";

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

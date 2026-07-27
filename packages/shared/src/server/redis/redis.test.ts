import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Redis } from "ioredis";

const mockEnv = vi.hoisted(() => ({
  REDIS_CLUSTER_ENABLED: "false",
  REDIS_ENABLE_AUTO_PIPELINING: "false",
  REDIS_SENTINEL_ENABLED: "false",
  REDIS_SENTINEL_MASTER_NAME: undefined as string | undefined,
  REDIS_SENTINEL_NODES: undefined as string | undefined,
}));

vi.mock("../../env", () => ({
  env: mockEnv,
}));

import { createNewRedisInstance, scanKeys } from "./redis";

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

describe("sentinel connections vs BullMQ blocking-connection watchdog", () => {
  beforeAll(() => {
    mockEnv.REDIS_SENTINEL_ENABLED = "true";
    mockEnv.REDIS_SENTINEL_MASTER_NAME = "mymaster";
    // Closed port: master resolution can never complete, so the client stays
    // in ioredis status "connecting" — the exact window in which BullMQ's
    // watchdog disconnect parks unguarded sentinel connections in "end".
    mockEnv.REDIS_SENTINEL_NODES = "127.0.0.1:1";
  });

  afterAll(() => {
    mockEnv.REDIS_SENTINEL_ENABLED = "false";
    mockEnv.REDIS_SENTINEL_MASTER_NAME = undefined;
    mockEnv.REDIS_SENTINEL_NODES = undefined;
  });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const createSentinelInstance = (): Redis => {
    const instance = createNewRedisInstance();
    expect(instance).not.toBeNull();
    return instance as Redis;
  };

  const teardown = async (instance: Redis) => {
    instance.disconnect();
    await vi.waitFor(() => expect(instance.status).toBe("end"), {
      timeout: 2_000,
    });
  };

  it("survives disconnect(reconnect=true) during sentinel master resolution", async () => {
    const instance = createSentinelInstance();
    expect(instance.status).toBe("connecting");

    // What bullmq's Worker.waitForJob watchdog fires when a blocking command
    // gets no response in time: bclient.disconnect(!this.closing)
    instance.disconnect(true);

    // Give the in-flight sentinel resolution time to settle; unguarded, the
    // pending connect() rejects and the client parks in terminal "end".
    await sleep(500);
    expect(instance.status).not.toBe("end");

    await teardown(instance);
  });

  it("protects duplicated connections too (bullmq creates its blocking client via duplicate())", async () => {
    const parent = createSentinelInstance();
    const blocking = parent.duplicate();

    expect(blocking.status).toBe("connecting");
    blocking.disconnect(true);

    await sleep(500);
    expect(blocking.status).not.toBe("end");

    await teardown(blocking);
    await teardown(parent);
  });

  it("still tears down for real on disconnect() without reconnect intent", async () => {
    const instance = createSentinelInstance();

    await teardown(instance);
  });
});

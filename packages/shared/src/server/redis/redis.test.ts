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
import {
  buildRedisErrorContext,
  formatRedisErrorMessage,
} from "./redisErrorContext";

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

const clusterAllFailedError = (lastNodeError: unknown) =>
  Object.assign(new Error("Failed to refresh slots cache."), {
    name: "ClusterAllFailedError",
    lastNodeError,
  });

describe("buildRedisErrorContext", () => {
  it("lifts lastNodeError out of a ClusterAllFailedError", () => {
    const context = buildRedisErrorContext(
      clusterAllFailedError(new Error("timeout")),
      "10.0.1.5:6379",
    );

    expect(context.failureMode).toBe("timeout");
    expect(context.error.message).toBe("Failed to refresh slots cache.");
    expect(context.lastNodeError).toMatchObject({
      message: "timeout",
      node: "10.0.1.5:6379",
    });
  });

  it("keeps the socket-level fields of the node error", () => {
    const nodeError = Object.assign(
      new Error("connect ECONNREFUSED 10.0.1.5:6379"),
      {
        code: "ECONNREFUSED",
        errno: -61,
        syscall: "connect",
        address: "10.0.1.5",
        port: 6379,
      },
    );

    const context = buildRedisErrorContext(clusterAllFailedError(nodeError));

    expect(context.failureMode).toBe("connection-refused");
    expect(context.lastNodeError).toMatchObject({
      code: "ECONNREFUSED",
      errno: -61,
      syscall: "connect",
      address: "10.0.1.5",
      port: 6379,
    });
    expect(context.lastNodeError).not.toHaveProperty("node");
  });

  it.each([
    ["timeout", new Error("timeout"), "timeout"],
    [
      "cluster-down",
      new Error("CLUSTERDOWN Hash slot not served"),
      "cluster-down",
    ],
    ["auth", new Error("WRONGPASS invalid username-password pair"), "auth"],
    [
      "readonly",
      new Error("READONLY You can't write against a replica."),
      "readonly",
    ],
    [
      "dns",
      Object.assign(new Error("getaddrinfo ENOTFOUND redis"), {
        code: "ENOTFOUND",
      }),
      "dns",
    ],
    [
      "tls",
      Object.assign(new Error("certificate has expired"), {
        code: "CERT_HAS_EXPIRED",
      }),
      "tls",
    ],
    ["unknown", new Error("something else entirely"), "unknown"],
  ])(
    "distinguishes %s behind the identical wrapper message",
    (_label, nodeError, expected) => {
      expect(
        buildRedisErrorContext(clusterAllFailedError(nodeError)).failureMode,
      ).toBe(expected);
    },
  );

  it("classifies plain non-cluster errors and omits lastNodeError", () => {
    const context = buildRedisErrorContext(
      Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
    );

    expect(context.failureMode).toBe("connection-reset");
    expect(context.lastNodeError).toBeUndefined();
  });

  // The text format in ../logger.ts renders `info.stack` and nothing else.
  it("keeps the stack at the top level, not nested under error", () => {
    const context = buildRedisErrorContext(
      clusterAllFailedError(new Error("timeout")),
    );

    expect(context.stack).toContain("Failed to refresh slots cache.");
    expect(context.error).not.toHaveProperty("stack");
  });

  it("does not throw on non-Error values", () => {
    expect(buildRedisErrorContext("boom")).toMatchObject({
      failureMode: "unknown",
      error: { message: "boom" },
    });
  });
});

describe("formatRedisErrorMessage", () => {
  it("puts the failure mode and node cause into the log line", () => {
    const context = buildRedisErrorContext(
      clusterAllFailedError(
        Object.assign(new Error("connect ECONNREFUSED 10.0.1.5:6379"), {
          code: "ECONNREFUSED",
        }),
      ),
      "10.0.1.5:6379",
    );

    expect(formatRedisErrorMessage("Redis cluster error", context)).toBe(
      "Redis cluster error [connection-refused]: Failed to refresh slots cache. " +
        "(last node error: connect ECONNREFUSED 10.0.1.5:6379 [ECONNREFUSED] from 10.0.1.5:6379)",
    );
  });

  it("omits the cause suffix when there is no node error", () => {
    const context = buildRedisErrorContext(new Error("Connection is closed."));

    expect(formatRedisErrorMessage("Redis error", context)).toBe(
      "Redis error [connection-closed]: Connection is closed.",
    );
  });
});

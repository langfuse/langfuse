import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const redisConstructor = vi.fn();

  class RedisMock {
    on = vi.fn();
    constructor(...args: unknown[]) {
      redisConstructor(...args);
    }
  }

  class ClusterMock {
    on = vi.fn();
  }

  return {
    redisConstructor,
    RedisMock,
    ClusterMock,
    env: {
      REDIS_CLUSTER_ENABLED: "false",
      REDIS_SENTINEL_ENABLED: "false",
      REDIS_TLS_ENABLED: "false",
      REDIS_ENABLE_AUTO_PIPELINING: "false",
      REDIS_CONNECTION_STRING: undefined,
      REDIS_HOST: "localhost",
      REDIS_PORT: 6379,
      REDIS_USERNAME: undefined,
      REDIS_AUTH: "secret",
      REDIS_SOCKET_TIMEOUT_MS: 30_000,
    } as Record<string, unknown>,
  };
});

vi.mock("../../env", () => ({ env: mocks.env }));
vi.mock("ioredis", () => ({
  default: mocks.RedisMock,
  Cluster: mocks.ClusterMock,
}));

// defaultRedisOptions is computed at module load, so each test mutates the
// mocked env and re-imports the module. The module also instantiates the
// singleton client on first import; clear the mock so assertions only see the
// explicit instance below.
const createInstanceWithFreshModule = async () => {
  const { createNewRedisInstance } = await import("./redis.js");
  mocks.redisConstructor.mockClear();
  createNewRedisInstance();
  expect(mocks.redisConstructor).toHaveBeenCalledTimes(1);
  return mocks.redisConstructor.mock.calls[0][0] as Record<string, unknown>;
};

describe("redis connection socket timeout", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.redisConstructor.mockClear();
  });

  it("passes REDIS_SOCKET_TIMEOUT_MS to new connections", async () => {
    mocks.env.REDIS_SOCKET_TIMEOUT_MS = 45_000;

    const options = await createInstanceWithFreshModule();

    expect(options.socketTimeout).toBe(45_000);
  });

  it("omits socketTimeout entirely when disabled via 0", async () => {
    // ioredis arms the watchdog for any defined value (0 would time out
    // instantly), so disabled must mean the option is absent, not 0.
    mocks.env.REDIS_SOCKET_TIMEOUT_MS = 0;

    const options = await createInstanceWithFreshModule();

    expect(options).not.toHaveProperty("socketTimeout");
  });
});

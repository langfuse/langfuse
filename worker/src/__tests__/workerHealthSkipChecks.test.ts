import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  hello: vi.fn(),
  queryRaw: vi.fn(),
  ping: vi.fn(),
}));

vi.mock("@langfuse/native", () => ({ hello: mocks.hello }));
vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { $queryRaw: mocks.queryRaw },
}));
vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  redis: { ping: mocks.ping },
}));

import api from "../api";

describe("worker /api/health dependency opt-out flags", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use("/api", api);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hello.mockReset();
    // A pool with no free connection: the query never settles.
    mocks.queryRaw.mockReturnValue(new Promise(() => {}));
    mocks.ping.mockResolvedValue("PONG");
  });

  it("checks Postgres and Redis by default", async () => {
    await expect(
      fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(200) }),
    ).rejects.toThrow();

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });

  it("answers without Postgres or Redis when both are skipped", async () => {
    const response = await fetch(
      `${baseUrl}/api/health?skipPostgresCheck=true&skipRedisCheck=true`,
      { signal: AbortSignal.timeout(1000) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(mocks.queryRaw).not.toHaveBeenCalled();
    expect(mocks.ping).not.toHaveBeenCalled();
    expect(mocks.hello).toHaveBeenCalledWith("health");
  });

  it("skips only the check that is opted out", async () => {
    const response = await fetch(
      `${baseUrl}/api/health?skipPostgresCheck=true`,
    );

    expect(response.status).toBe(200);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
    expect(mocks.ping).toHaveBeenCalledTimes(1);
  });

  it("still reports a broken native addon", async () => {
    mocks.hello.mockImplementation(() => {
      throw new Error("native addon unavailable");
    });

    const response = await fetch(
      `${baseUrl}/api/health?skipPostgresCheck=true&skipRedisCheck=true`,
    );

    expect(response.status).toBe(500);
  });

  it("keeps the checks on /api/ready", async () => {
    await expect(
      fetch(`${baseUrl}/api/ready?skipPostgresCheck=true`, {
        signal: AbortSignal.timeout(200),
      }),
    ).rejects.toThrow();

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
  });
});

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  postgresConnectionRetryExtension,
  withPostgresConnectionRetry,
} from "./dbConnectionRetry";
import { logger } from "./server/logger";

const unreachable = () =>
  new Prisma.PrismaClientKnownRequestError(
    "Can't reach database server at `db:5432`",
    { code: "P1001", clientVersion: "test" },
  );
const startingUp = () =>
  new Prisma.PrismaClientUnknownRequestError(
    "Error in connector: Error querying the database: FATAL: the database system is starting up",
    { clientVersion: "test" },
  );
const connectionClosedOnInit = () =>
  new Prisma.PrismaClientInitializationError(
    "Server has closed the connection.",
    "test",
    "P1017",
  );

describe("withPostgresConnectionRetry", () => {
  it.each([
    ["unreachable server", unreachable],
    ["server starting up", startingUp],
    ["connection closed", connectionClosedOnInit],
  ])("retries reads on %s", async (_, makeError) => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(makeError())
      .mockResolvedValueOnce("ok");

    await expect(
      withPostgresConnectionRetry({ operation: "findFirst" }, run, 0),
    ).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not retry writes on connection errors", async () => {
    const error = unreachable();
    const run = vi.fn().mockRejectedValue(error);

    await expect(
      withPostgresConnectionRetry({ operation: "create" }, run, 0),
    ).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not retry query errors", async () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "test" },
    );
    const run = vi.fn().mockRejectedValue(error);

    await expect(
      withPostgresConnectionRetry({ operation: "findFirst" }, run, 0),
    ).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("throws the last error once retries are exhausted", async () => {
    const last = unreachable();
    const run = vi
      .fn()
      .mockRejectedValueOnce(startingUp())
      .mockRejectedValueOnce(startingUp())
      .mockRejectedValueOnce(startingUp())
      .mockRejectedValueOnce(last);

    await expect(
      withPostgresConnectionRetry({ operation: "findMany" }, run, 0),
    ).rejects.toBe(last);
    expect(run).toHaveBeenCalledTimes(4);
  });
});

describe("postgresConnectionRetryExtension", () => {
  // Nothing listens on port 1, so every query fails to connect.
  const base = new PrismaClient({
    datasourceUrl: "postgresql://postgres:postgres@127.0.0.1:1/postgres",
  });
  const client = base.$extends(postgresConnectionRetryExtension);
  const warn = vi.spyOn(logger, "warn");
  const retryWarnings = () =>
    warn.mock.calls.filter(([message]) =>
      String(message).startsWith("Retrying Postgres"),
    );

  beforeEach(() => warn.mockClear());
  afterAll(() => base.$disconnect());

  it("retries reads issued through the extended client", async () => {
    await expect(client.project.findFirst()).rejects.toThrow(
      "Can't reach database server",
    );
    expect(retryWarnings()).toHaveLength(3);
  });

  it("does not retry writes issued through the extended client", async () => {
    await expect(
      client.organization.create({ data: { name: "unreachable" } }),
    ).rejects.toThrow("Can't reach database server");
    expect(retryWarnings()).toHaveLength(0);
  });

  it.each(["batch", "interactive"] as const)(
    "does not retry reads inside %s transactions",
    async (kind) => {
      const error = unreachable();
      const run = vi.fn().mockRejectedValue(error);
      const failingClient = client.$extends({
        query: {
          project: {
            findFirst: () => run(),
          },
        },
      });

      // Stub only transaction lifecycle calls; Prisma still supplies the real
      // transaction metadata to the query extensions without needing Postgres.
      const engine = (
        base as unknown as {
          _engine: { transaction: (action: string) => Promise<unknown> };
        }
      )._engine;
      const transaction = vi
        .spyOn(engine, "transaction")
        .mockResolvedValue({ id: "connection-retry-test" });

      try {
        const result =
          kind === "batch"
            ? failingClient.$transaction([failingClient.project.findFirst()])
            : failingClient.$transaction((tx) => tx.project.findFirst());

        await expect(result).rejects.toBe(error);
        expect(run).toHaveBeenCalledTimes(1);
        expect(retryWarnings()).toHaveLength(0);
      } finally {
        transaction.mockRestore();
      }
    },
  );
});

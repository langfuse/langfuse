import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { withPostgresConnectionRetry } from "./dbConnectionRetry";

const knownError = (code: string, message: string) =>
  new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: "test",
  });

const unreachable = () =>
  knownError("P1001", "Can't reach database server at `db:5432`");
const startingUp = () =>
  new Prisma.PrismaClientUnknownRequestError(
    "Error in connector: Error querying the database: FATAL: the database system is starting up",
    { clientVersion: "test" },
  );
const connectionClosed = () =>
  knownError("P1017", "Server has closed the connection.");

const noDelays = [0, 0, 0];

describe("withPostgresConnectionRetry", () => {
  it.each([
    ["unreachable server", unreachable],
    ["server starting up", startingUp],
    ["connection closed mid-query", connectionClosed],
  ])("retries reads on %s", async (_, makeError) => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(makeError())
      .mockResolvedValueOnce("ok");

    await expect(
      withPostgresConnectionRetry({ operation: "findFirst" }, run, noDelays),
    ).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it.each(["create", "update", "$executeRaw", "$queryRaw"])(
    "does not retry %s on connection errors",
    async (operation) => {
      const error = unreachable();
      const run = vi.fn().mockRejectedValue(error);

      await expect(
        withPostgresConnectionRetry({ operation }, run, noDelays),
      ).rejects.toBe(error);
      expect(run).toHaveBeenCalledTimes(1);
    },
  );

  it("does not retry query errors", async () => {
    const error = knownError("P2002", "Unique constraint failed");
    const run = vi.fn().mockRejectedValue(error);

    await expect(
      withPostgresConnectionRetry({ operation: "findFirst" }, run, noDelays),
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
      withPostgresConnectionRetry({ operation: "findMany" }, run, noDelays),
    ).rejects.toBe(last);
    expect(run).toHaveBeenCalledTimes(4);
  });
});

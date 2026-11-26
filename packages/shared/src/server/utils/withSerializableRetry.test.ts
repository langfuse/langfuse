import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { withSerializableRetry } from "./withSerializableRetry";

describe("withSerializableRetry", () => {
  it("retries serialization failures until the transaction commits", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(prismaError("P2034"))
      .mockRejectedValueOnce(prismaError("P2034"))
      .mockResolvedValueOnce("committed");

    await expect(withSerializableRetry(fakePrisma(), operation)).resolves.toBe(
      "committed",
    );
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("rethrows the serialization failure once attempts run out", async () => {
    const operation = vi.fn().mockRejectedValue(prismaError("P2034"));

    await expect(
      withSerializableRetry(fakePrisma(), operation),
    ).rejects.toMatchObject({ code: "P2034" });
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("rethrows other errors without retrying", async () => {
    const operation = vi.fn().mockRejectedValue(prismaError("P2002"));

    await expect(
      withSerializableRetry(fakePrisma(), operation),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(operation).toHaveBeenCalledOnce();
  });
});

function fakePrisma() {
  return {
    $transaction: (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      fn({} as Prisma.TransactionClient),
  } as unknown as PrismaClient;
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(code, {
    code,
    clientVersion: "test",
  });
}

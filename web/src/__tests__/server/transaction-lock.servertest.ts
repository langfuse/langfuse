import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import { lockTransactionKey } from "@langfuse/shared/src/server";

/** Starts a transaction that locks `key` and holds it until `release` is called. */
const holdLock = (key: string, events: string[], name: string) => {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let signalLocked!: () => void;
  const locked = new Promise<void>((resolve) => (signalLocked = resolve));
  const done = prisma.$transaction(
    async (tx) => {
      await lockTransactionKey(tx, key);
      events.push(`${name} locked`);
      signalLocked();
      await released;
      events.push(`${name} done`);
    },
    { timeout: 20_000 },
  );
  return { locked, release, done };
};

const lockOnce = (key: string, events: string[], name: string) =>
  prisma.$transaction(
    async (tx) => {
      await lockTransactionKey(tx, key);
      events.push(`${name} locked`);
    },
    { maxWait: 20_000, timeout: 20_000 },
  );

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("lockTransactionKey", () => {
  const keys: string[] = [];
  const newKey = () => {
    const key = `transaction-lock-test:${randomUUID()}`;
    keys.push(key);
    return key;
  };

  afterAll(async () => {
    await prisma.transactionLock.deleteMany({ where: { key: { in: keys } } });
  });

  it("makes a second transaction on the same key wait until the first ends", async () => {
    const key = newKey();
    const events: string[] = [];

    const first = holdLock(key, events, "first");
    await first.locked;
    const second = lockOnce(key, events, "second");

    await sleep(500);
    expect(events).toEqual(["first locked"]);

    first.release();
    await Promise.all([first.done, second]);
    expect(events).toEqual(["first locked", "first done", "second locked"]);
    // On CockroachDB the lock writes a row in transaction_locks; it must not
    // outlive the transaction.
    expect(await prisma.transactionLock.count({ where: { key } })).toBe(0);
  });
});

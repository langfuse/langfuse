import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
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
  const newKey = () => `transaction-lock-test:${randomUUID()}`;

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
  });
});

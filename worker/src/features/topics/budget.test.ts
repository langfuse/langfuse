import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TopicsBudget, TopicsBudgetExhausted } from "./budget";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
describe("Topics durable developer budget", () => {
  it("retains uncertain reservations across workers and enforces the aggregate cap", async () => {
    const root = await mkdtemp(join(tmpdir(), "topics-budget-"));
    directories.push(root);
    await new TopicsBudget(root).reserve("uncertain", "first", 0.1, 0.25);
    const restarted = new TopicsBudget(root);
    await expect(
      restarted.reserve("uncertain", "first", 0.1, 0.25),
    ).rejects.toThrow("no accepted checkpoint");
    await restarted.reserve("accepted", "second", 0.1, 0.25);
    await restarted.complete("accepted", 0.001);
    await expect(
      restarted.reserve("third", "third", 0.06, 5),
    ).rejects.toBeInstanceOf(TopicsBudgetExhausted);
    expect(await restarted.totals("second")).toEqual({
      reservedCostUsd: 0.1,
      spentCostUsd: 0.001,
    });
    await expect(
      restarted.reserve("too-much-for-run", "second", 0.02, 0.11),
    ).rejects.toBeInstanceOf(TopicsBudgetExhausted);
  });
});

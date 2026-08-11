import assert from "node:assert/strict";
import { test } from "node:test";

import { createSerialQueue } from "./sandboxQueue.js";

test("createSerialQueue runs queued tasks one at a time, in call order", async () => {
  const runExclusive = createSerialQueue();
  let active = 0;
  let maxActive = 0;
  const completionOrder: number[] = [];

  function run(id: number, delayMs: number) {
    return runExclusive(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      completionOrder.push(id);
      active -= 1;
    });
  }

  // Task 1 is slower than task 2. Without serialization, task 2 would finish
  // first and both would report `active > 1` while overlapping.
  const first = run(1, 30);
  const second = run(2, 5);

  await Promise.all([first, second]);

  assert.equal(maxActive, 1, "tasks must never run concurrently");
  assert.deepEqual(
    completionOrder,
    [1, 2],
    "tasks must complete in call order, not completion-speed order",
  );
});

test("createSerialQueue keeps processing later tasks after an earlier one rejects", async () => {
  const runExclusive = createSerialQueue();

  await assert.rejects(
    runExclusive(async () => {
      throw new Error("boom");
    }),
  );

  const result = await runExclusive(async () => "ok");
  assert.equal(result, "ok");
});

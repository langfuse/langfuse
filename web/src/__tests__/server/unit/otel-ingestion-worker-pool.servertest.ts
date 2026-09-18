import { describe, expect, it, vi } from "vitest";

import { tryScheduleOtelIngestionWorkerLifecycle } from "@/src/server/otel/otelIngestionWorkerPool";

function deferred() {
  return Promise.withResolvers<void>();
}

describe("OTel ingestion worker admission", () => {
  it("runs one lifecycle, queues one, and rejects a third", async () => {
    const firstRelease = deferred();
    const secondRelease = deferred();
    const started: string[] = [];

    const first = tryScheduleOtelIngestionWorkerLifecycle(async () => {
      started.push("first");
      await firstRelease.promise;
    });
    await vi.waitFor(() => expect(started).toEqual(["first"]));

    const second = tryScheduleOtelIngestionWorkerLifecycle(async () => {
      started.push("second");
      await secondRelease.promise;
    });
    const third = tryScheduleOtelIngestionWorkerLifecycle(async () => {});

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(third).toBeUndefined();
    expect(started).toEqual(["first"]);

    firstRelease.resolve();
    await first;
    await vi.waitFor(() => expect(started).toEqual(["first", "second"]));
    secondRelease.resolve();
    await second;
  });

  it("removes an aborted waiter so its queue slot can be reused", async () => {
    const firstRelease = deferred();
    const first = tryScheduleOtelIngestionWorkerLifecycle(
      async () => firstRelease.promise,
    );
    const abortController = new AbortController();
    let abortedTaskStarted = false;
    const aborted = tryScheduleOtelIngestionWorkerLifecycle(async () => {
      abortedTaskStarted = true;
    }, abortController.signal);

    abortController.abort();
    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });

    let nextTaskStarted = false;
    const next = tryScheduleOtelIngestionWorkerLifecycle(async () => {
      nextTaskStarted = true;
    });
    expect(next).toBeDefined();

    firstRelease.resolve();
    await first;
    await next;
    expect(abortedTaskStarted).toBe(false);
    expect(nextTaskStarted).toBe(true);
  });
});

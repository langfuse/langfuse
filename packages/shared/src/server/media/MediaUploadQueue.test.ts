import { describe, expect, it } from "vitest";

import { MediaUploadQueue } from "./MediaUploadQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe("MediaUploadQueue", () => {
  it("starts admitted work in FIFO order and respects both limits", async () => {
    const queue = new MediaUploadQueue(2, 10);
    const first = deferred<string>();
    const second = deferred<string>();
    const third = deferred<string>();
    const fourth = deferred<string>();
    const started: string[] = [];

    const firstRun = queue.run(4, async () => {
      started.push("first");
      return first.promise;
    });
    const secondRun = queue.run(4, async () => {
      started.push("second");
      return second.promise;
    });
    const thirdRun = queue.run(1, async () => {
      started.push("third");
      return third.promise;
    });
    const fourthRun = queue.run(10, async () => {
      started.push("fourth");
      return fourth.promise;
    });

    await Promise.resolve();
    expect(started).toEqual(["first", "second"]);

    first.resolve("first");
    await firstRun;
    expect(started).toEqual(["first", "second", "third"]);

    second.resolve("second");
    await secondRun;
    expect(started).toEqual(["first", "second", "third"]);

    third.resolve("third");
    await thirdRun;
    expect(started).toEqual(["first", "second", "third", "fourth"]);

    fourth.resolve("fourth");
    await expect(fourthRun).resolves.toBe("fourth");
  });

  it("runs an oversized item alone", async () => {
    const queue = new MediaUploadQueue(5, 10);
    const active = deferred<void>();
    const large = deferred<void>();
    const following = deferred<void>();
    const started: string[] = [];

    const activeRun = queue.run(1, async () => {
      started.push("active");
      return active.promise;
    });
    const largeRun = queue.run(11, async () => {
      started.push("large");
      return large.promise;
    });
    const followingRun = queue.run(0, async () => {
      started.push("following");
      return following.promise;
    });

    await Promise.resolve();
    expect(started).toEqual(["active"]);
    active.resolve();
    await activeRun;
    await Promise.resolve();
    expect(started).toEqual(["active", "large"]);
    large.resolve();
    await largeRun;
    await Promise.resolve();
    expect(started).toEqual(["active", "large", "following"]);
    following.resolve();
    await followingRun;
  });

  it("releases its reservation after rejection", async () => {
    const queue = new MediaUploadQueue(1, 10);
    const failed = deferred<void>();
    const next = deferred<string>();
    let started = 0;

    const failedRun = queue.run(10, async () => {
      started += 1;
      return failed.promise;
    });
    const nextRun = queue.run(10, async () => {
      started += 1;
      return next.promise;
    });

    failed.reject(new Error("upload failed"));
    await expect(failedRun).rejects.toThrow("upload failed");
    await Promise.resolve();
    expect(started).toBe(2);
    next.resolve("ok");
    await expect(nextRun).resolves.toBe("ok");
  });

  it("releases its reservation after a synchronous throw", async () => {
    const queue = new MediaUploadQueue(1, 10);
    let nextStarted = false;

    const failedRun = queue.run(10, () => {
      throw new Error("upload failed synchronously");
    });
    const nextRun = queue.run(10, async () => {
      nextStarted = true;
    });

    await expect(failedRun).rejects.toThrow("upload failed synchronously");
    await nextRun;
    expect(nextStarted).toBe(true);
  });

  it("does not share reservations between queue calls", async () => {
    const firstQueue = new MediaUploadQueue(1, 10);
    const secondQueue = new MediaUploadQueue(1, 10);
    const first = deferred<void>();
    let secondStarted = false;

    const firstRun = firstQueue.run(10, async () => first.promise);
    const secondRun = secondQueue.run(10, async () => {
      secondStarted = true;
    });

    await secondRun;
    expect(secondStarted).toBe(true);
    first.resolve();
    await firstRun;
  });

  it.each([
    [0, 1],
    [1.5, 1],
    [Number.POSITIVE_INFINITY, 1],
    [Number.MAX_SAFE_INTEGER + 1, 1],
    [1, 0],
    [1, 1.5],
  ])("rejects invalid constructor limits: %s, %s", (concurrency, maxBytes) => {
    expect(() => new MediaUploadQueue(concurrency, maxBytes)).toThrow();
  });

  it.each([-1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid byte sizes: %s",
    async (bytes) => {
      await expect(
        new MediaUploadQueue(1, 1).run(bytes, async () => undefined),
      ).rejects.toThrow();
    },
  );
});

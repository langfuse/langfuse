import { describe, expect, it } from "vitest";

import { MediaUploadPool } from "./MediaUploadPool";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe("MediaUploadPool", () => {
  it("starts fitting work in arrival order while respecting both limits", async () => {
    const pool = new MediaUploadPool(2, 10);
    const first = deferred<string>();
    const second = deferred<string>();
    const third = deferred<string>();
    const fourth = deferred<string>();
    const started: string[] = [];

    const firstRun = pool.run(4, async () => {
      started.push("first");
      return first.promise;
    });
    const secondRun = pool.run(4, async () => {
      started.push("second");
      return second.promise;
    });
    const thirdRun = pool.run(1, async () => {
      started.push("third");
      return third.promise;
    });
    const fourthRun = pool.run(10, async () => {
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

  it("starts fitting work behind a blocked item when a slot is released", async () => {
    const pool = new MediaUploadPool(2, 10);
    const first = deferred<void>();
    const second = deferred<void>();
    const large = deferred<void>();
    const fitting = deferred<void>();
    const started: string[] = [];

    const firstRun = pool.run(5, async () => {
      started.push("first");
      return first.promise;
    });
    const secondRun = pool.run(5, async () => {
      started.push("second");
      return second.promise;
    });
    const largeRun = pool.run(10, async () => {
      started.push("large");
      return large.promise;
    });
    const fittingRun = pool.run(4, async () => {
      started.push("fitting");
      return fitting.promise;
    });

    await Promise.resolve();
    expect(started).toEqual(["first", "second"]);
    first.resolve();
    await firstRun;
    expect(started).toEqual(["first", "second", "fitting"]);

    second.resolve();
    await secondRun;
    fitting.resolve();
    await fittingRun;
    expect(started).toEqual(["first", "second", "fitting", "large"]);
    large.resolve();
    await largeRun;
  });

  it("reserves capacity for a large upload after bounded bypasses", async () => {
    const pool = new MediaUploadPool(2, 10);
    const small = Array.from({ length: 5 }, () => deferred<void>());
    const large = deferred<void>();
    const started: Array<number | "large"> = [];
    const runSmall = (index: number) =>
      pool.run(3, async () => {
        started.push(index);
        await small[index].promise;
      });
    const first = runSmall(0);
    const second = runSmall(1);
    const largeRun = pool.run(8, async () => {
      started.push("large");
      await large.promise;
    });

    small[0].resolve();
    await first;
    const third = runSmall(2);
    await Promise.resolve();
    expect(started).toContain(2);

    small[1].resolve();
    await second;
    const fourth = runSmall(3);
    await Promise.resolve();
    expect(started).toContain(3);

    small[2].resolve();
    await third;
    const fifth = runSmall(4);
    await Promise.resolve();
    expect(started).not.toContain(4);

    small[3].resolve();
    await fourth;
    expect(started).toContain("large");
    expect(started).not.toContain(4);
    large.resolve();
    await largeRun;
    expect(started).toContain(4);
    small[4].resolve();
    await fifth;
  });

  it("runs an oversized item alone after current work drains", async () => {
    const pool = new MediaUploadPool(5, 10);
    const active = deferred<void>();
    const large = deferred<void>();
    const following = deferred<void>();
    const started: string[] = [];

    const activeRun = pool.run(1, async () => {
      started.push("active");
      return active.promise;
    });
    const largeRun = pool.run(11, async () => {
      started.push("large");
      return large.promise;
    });
    const followingRun = pool.run(0, async () => {
      started.push("following");
      return following.promise;
    });

    await Promise.resolve();
    expect(started).toEqual(["active", "following"]);
    following.resolve();
    await followingRun;
    active.resolve();
    await activeRun;
    await Promise.resolve();
    expect(started).toEqual(["active", "following", "large"]);

    const duringLarge = deferred<void>();
    const duringLargeRun = pool.run(0, async () => {
      started.push("during large");
      return duringLarge.promise;
    });
    await Promise.resolve();
    expect(started).toEqual(["active", "following", "large"]);

    large.resolve();
    await largeRun;
    expect(started).toEqual(["active", "following", "large", "during large"]);
    duringLarge.resolve();
    await duringLargeRun;
  });

  it("releases its reservation after rejection", async () => {
    const pool = new MediaUploadPool(1, 10);
    const failed = deferred<void>();
    const next = deferred<string>();
    let started = 0;

    const failedRun = pool.run(10, async () => {
      started += 1;
      return failed.promise;
    });
    const nextRun = pool.run(10, async () => {
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
    const pool = new MediaUploadPool(1, 10);
    let nextStarted = false;

    const failedRun = pool.run(10, () => {
      throw new Error("upload failed synchronously");
    });
    const nextRun = pool.run(10, async () => {
      nextStarted = true;
    });

    await expect(failedRun).rejects.toThrow("upload failed synchronously");
    await nextRun;
    expect(nextStarted).toBe(true);
  });

  it("drains a large backlog within the concurrency limit", async () => {
    const pool = new MediaUploadPool(4, 4);
    const gate = deferred<void>();
    const first = pool.run(4, async () => gate.promise);
    let active = 0;
    let peakActive = 0;
    let completed = 0;
    const waiting = Array.from({ length: 2050 }, () =>
      pool.run(1, async () => {
        active++;
        peakActive = Math.max(peakActive, active);
        await Promise.resolve();
        active--;
        completed++;
      }),
    );

    gate.resolve();
    await Promise.all([first, ...waiting]);
    expect(completed).toBe(2050);
    expect(peakActive).toBeLessThanOrEqual(4);
  });

  it("does not share reservations between pool calls", async () => {
    const firstPool = new MediaUploadPool(1, 10);
    const secondPool = new MediaUploadPool(1, 10);
    const first = deferred<void>();
    let secondStarted = false;

    const firstRun = firstPool.run(10, async () => first.promise);
    const secondRun = secondPool.run(10, async () => {
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
    [Number.MAX_SAFE_INTEGER + 1, 1],
    [1, 0],
    [1, 1.5],
    [1, Number.MAX_SAFE_INTEGER + 1],
  ])("rejects invalid constructor limits: %s, %s", (concurrency, maxBytes) => {
    expect(() => new MediaUploadPool(concurrency, maxBytes)).toThrow();
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid byte sizes: %s",
    async (bytes) => {
      await expect(
        new MediaUploadPool(1, 1).run(bytes, async () => undefined),
      ).rejects.toThrow();
    },
  );
});

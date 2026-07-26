import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const telemetry = vi.hoisted(() => ({
  recordDistribution: vi.fn(),
  recordGauge: vi.fn(),
  recordIncrement: vi.fn(),
  span: { setAttribute: vi.fn() },
  traceException: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  getCurrentSpan: vi.fn(() => telemetry.span),
  instrumentAsync: vi.fn(
    (
      _options: unknown,
      callback: (span: typeof telemetry.span) => Promise<unknown>,
    ) => callback(telemetry.span),
  ),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  recordDistribution: telemetry.recordDistribution,
  recordGauge: telemetry.recordGauge,
  recordIncrement: telemetry.recordIncrement,
  redis: null,
  traceException: telemetry.traceException,
}));

import { PeriodicRunner } from "../utils/PeriodicRunner";
import { PeriodicExclusiveRunner } from "../utils/PeriodicExclusiveRunner";

/**
 * Helper to flush microtasks without advancing timers
 *
 * JavaScript has different "task queues" that execute code in a specific order:
 * 1. Synchronous code runs first
 * 2. Microtasks (like Promise callbacks) run next
 * 3. Macrotasks (like setTimeout) run after microtasks
 *
 * When testing async code with fake timers, we often need to let microtasks
 * complete WITHOUT advancing the timer (which would also trigger macrotasks).
 *
 * This function works by:
 * - Creating a Promise that will resolve in the microtask queue
 * - Using `queueMicrotask()` to schedule the Promise resolution
 * - Awaiting that Promise, which pauses execution until all microtasks drain
 *
 * In these tests, we use it after calling `runner.start()` to ensure the
 * initial async execution completes before we check the results or advance timers.
 */
const flushMicrotasks = () => new Promise((r) => queueMicrotask(r));

const expectCompleted = (
  outcome: "success" | "failed" | "skipped",
  tags: Record<string, string>,
) =>
  expect(telemetry.recordIncrement).toHaveBeenCalledWith(
    "langfuse.periodic_runner.completed",
    1,
    { outcome, ...tags },
  );

// Test subclass that tracks execution
class TestRunner extends PeriodicRunner {
  public callCount = 0;
  public shouldThrow = false;
  public returnInterval: number | undefined = undefined;

  constructor() {
    super("test_runner");
  }

  protected get name(): string {
    return "test-runner";
  }

  protected get defaultIntervalMs(): number {
    return 1000;
  }

  protected async execute(): Promise<number | void> {
    this.callCount++;
    if (this.shouldThrow) {
      this.shouldThrow = false; // Only throw once
      throw new Error("Test error");
    }
    return this.returnInterval;
  }
}

class TestExclusiveRunner extends PeriodicExclusiveRunner {
  public callCount = 0;
  public failNext = false;
  public lockAcquired = true;
  public lockNotAcquiredCount = 0;
  public readonly operationError = new Error("Caught operation error");

  constructor(lockMode: "stub" | "unavailable" | "release_failure" = "stub") {
    super({
      name: "test-exclusive-runner",
      metricName: "test_exclusive_runner",
      metricScope: "test_scope",
      lockKey: "test-exclusive-runner-lock",
      lockTtlSeconds: 60,
      onUnavailable: "fail",
    });
    if (lockMode !== "unavailable") {
      this.lock.acquire = async () =>
        this.lockAcquired ? "acquired" : "held_by_other";
    }
    if (lockMode !== "release_failure") {
      this.lock.release = async () => true;
    }
  }

  protected get defaultIntervalMs(): number {
    return 1000;
  }

  protected async execute(): Promise<void> {
    await this.withLock(
      async () => {
        this.callCount++;
        if (this.failNext) {
          this.failNext = false;
          throw this.operationError;
        }
      },
      undefined,
      () => {
        this.lockNotAcquiredCount++;
      },
    );
  }
}

describe("PeriodicRunner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T08:00:00.000Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should call execute on start and record canonical metrics", async () => {
    const runner = new TestRunner();

    runner.start();
    await flushMicrotasks();

    expect(runner.callCount).toBe(1);
    expect(telemetry.recordIncrement).toHaveBeenCalledWith(
      "langfuse.periodic_runner.started",
      1,
      { runner: "test_runner" },
    );
    expectCompleted("success", { runner: "test_runner" });
    expect(telemetry.recordDistribution).toHaveBeenCalledWith(
      "langfuse.periodic_runner.duration_ms",
      0,
      {
        outcome: "success",
        runner: "test_runner",
        unit: "milliseconds",
      },
    );
    expect(telemetry.recordGauge).toHaveBeenCalledWith(
      "langfuse.periodic_runner.last_healthy_timestamp_seconds",
      Date.now() / 1000,
      { runner: "test_runner", unit: "seconds" },
    );
    runner.stop();
  });

  it("should call execute repeatedly at default interval", async () => {
    const runner = new TestRunner();

    runner.start();
    await flushMicrotasks(); // First execution

    expect(runner.callCount).toBe(1);

    await vi.advanceTimersByTimeAsync(1000); // Advance to trigger second execution

    expect(runner.callCount).toBe(2);
    runner.stop();
  });

  it("should use dynamic interval when execute returns a number", async () => {
    const runner = new TestRunner();
    runner.returnInterval = 500; // Return shorter interval

    runner.start();
    await flushMicrotasks(); // First execution

    expect(runner.callCount).toBe(1);

    // Should wait 500ms (not 1000ms) for next execution
    await vi.advanceTimersByTimeAsync(499);
    expect(runner.callCount).toBe(1); // Not yet

    await vi.advanceTimersByTimeAsync(1);
    expect(runner.callCount).toBe(2); // Now it fired

    runner.stop();
  });

  it("should stop scheduling when stop is called", async () => {
    const runner = new TestRunner();

    runner.start();
    await flushMicrotasks();
    expect(runner.callCount).toBe(1);

    runner.stop();

    await vi.advanceTimersByTimeAsync(5000);

    expect(runner.callCount).toBe(1); // No more executions
  });

  it("should continue scheduling after execute throws", async () => {
    const runner = new TestRunner();
    runner.shouldThrow = true;

    runner.start();
    await flushMicrotasks(); // First execution (throws)
    expect(runner.callCount).toBe(1);

    await vi.advanceTimersByTimeAsync(1000); // Second execution (succeeds)
    expect(runner.callCount).toBe(2);

    runner.stop();
  });

  it("should not start twice when start is called multiple times", async () => {
    const runner = new TestRunner();

    runner.start();
    runner.start(); // Second call should be ignored
    await flushMicrotasks();

    expect(runner.callCount).toBe(1);
    runner.stop();
  });

  it("marks a caught error failed and keeps the loop running", async () => {
    const runner = new TestExclusiveRunner();
    runner.failNext = true;

    runner.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(telemetry.traceException).toHaveBeenCalledWith(
      runner.operationError,
    );
    expectCompleted("failed", {
      runner: "test_exclusive_runner",
      scope: "test_scope",
    });
    expect(telemetry.recordGauge).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(runner.callCount).toBe(2);
    runner.stop();
  });

  it("records a lock miss as skipped", async () => {
    const runner = new TestExclusiveRunner();
    runner.lockAcquired = false;

    runner.start();
    await vi.advanceTimersByTimeAsync(0);

    expectCompleted("skipped", {
      runner: "test_exclusive_runner",
      scope: "test_scope",
    });
    expect(telemetry.traceException).not.toHaveBeenCalled();
    expect(telemetry.recordGauge).not.toHaveBeenCalled();
    expect(runner.lockNotAcquiredCount).toBe(1);
    runner.stop();
  });

  it.each(["unavailable", "release_failure"] as const)(
    "records a %s lock as failed",
    async (lockMode) => {
      const runner = new TestExclusiveRunner(lockMode);

      runner.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(telemetry.traceException).toHaveBeenCalledWith(expect.any(Error));
      expectCompleted("failed", {
        runner: "test_exclusive_runner",
        scope: "test_scope",
      });
      expect(telemetry.recordGauge).not.toHaveBeenCalled();
      runner.stop();
    },
  );
});

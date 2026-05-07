import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PeriodicRunner } from "../utils/PeriodicRunner";

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

// Test subclass that tracks execution
class TestRunner extends PeriodicRunner {
  public callCount = 0;
  public shouldThrow = false;
  public returnInterval: number | undefined = undefined;

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

describe("PeriodicRunner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should call execute on start", async () => {
    const runner = new TestRunner();

    runner.start();
    await flushMicrotasks();

    expect(runner.callCount).toBe(1);
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
});

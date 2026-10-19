import { afterEach, describe, expect, it, vi } from "vitest";
import { PeriodicRunner } from "./PeriodicRunner";

vi.mock("@langfuse/shared/src/server", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
  contextWithLangfuseProps: () => ({}),
  instrumentAsync: async (
    _options: unknown,
    operation: (span: { setAttribute: () => void }) => Promise<void>,
  ) => operation({ setAttribute: () => {} }),
  recordDistribution: vi.fn(),
  recordGauge: vi.fn(),
  recordIncrement: vi.fn(),
  traceException: vi.fn(),
}));
vi.mock("@opentelemetry/api", () => ({
  context: {
    with: (_context: unknown, operation: () => unknown) => operation(),
  },
  SpanKind: { INTERNAL: 0 },
}));

class TestRunner extends PeriodicRunner {
  protected name = "test";
  protected defaultIntervalMs = 10;
  constructor(private readonly operation: () => Promise<void>) {
    super("test");
  }
  protected execute() {
    return this.operation();
  }
}

afterEach(() => vi.useRealTimers());

describe("PeriodicRunner.drain", () => {
  it("waits for the active batch and does not schedule another", async () => {
    vi.useFakeTimers();
    let finish: () => void = () => {};
    const operation = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const runner = new TestRunner(operation);
    runner.start();
    let drained = false;
    const drain = runner.drain(5_000).then(() => {
      drained = true;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(drained).toBe(false);
    finish();
    await drain;
    await vi.advanceTimersByTimeAsync(100);
    expect(operation).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds shutdown when the active batch is stuck", async () => {
    vi.useFakeTimers();
    const runner = new TestRunner(() => new Promise<void>(() => {}));
    runner.start();
    const drain = runner.drain(50);
    await vi.advanceTimersByTimeAsync(50);
    await drain;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns immediately when no batch started", async () => {
    vi.useFakeTimers();
    await new TestRunner(async () => {}).drain(5_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

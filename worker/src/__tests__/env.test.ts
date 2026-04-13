import { afterEach, describe, expect, it, vi } from "vitest";

const originalSampleRate = process.env.LANGFUSE_QUEUE_METRICS_SAMPLE_RATE;

describe("worker env", () => {
  afterEach(() => {
    if (originalSampleRate === undefined) {
      delete process.env.LANGFUSE_QUEUE_METRICS_SAMPLE_RATE;
    } else {
      process.env.LANGFUSE_QUEUE_METRICS_SAMPLE_RATE = originalSampleRate;
    }

    vi.resetModules();
  });

  it("allows disabling queue depth sampling for sharded queues", async () => {
    process.env.LANGFUSE_QUEUE_METRICS_SAMPLE_RATE = "0";
    vi.resetModules();

    const { env } = await import("../env");

    expect(env.LANGFUSE_QUEUE_METRICS_SAMPLE_RATE).toBe(0);
  });

  it("rejects queue depth sample rates above 1", async () => {
    process.env.LANGFUSE_QUEUE_METRICS_SAMPLE_RATE = "2";
    vi.resetModules();

    await expect(import("../env")).rejects.toThrow(
      /LANGFUSE_QUEUE_METRICS_SAMPLE_RATE/i,
    );
  });
});

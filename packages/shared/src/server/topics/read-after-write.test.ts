import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readUntilVisible } from "./read-after-write";

const mocks = vi.hoisted(() => ({ recordIncrement: vi.fn() }));
vi.mock("../instrumentation", () => ({
  recordIncrement: mocks.recordIncrement,
}));

const context = { projectId: "project-a", runId: "run-a" };

beforeEach(() => {
  vi.useFakeTimers();
  mocks.recordIncrement.mockReset();
});
afterEach(() => vi.useRealTimers());

it("retries a failed read and reports a later visible result as visible after retry", async () => {
  const read = vi
    .fn<() => Promise<number>>()
    .mockRejectedValueOnce(new Error("timeout"))
    .mockResolvedValue(3);
  const result = readUntilVisible("assignments", context, read, (n) => n >= 3);
  await vi.runAllTimersAsync();
  await expect(result).resolves.toBe(3);
  expect(mocks.recordIncrement).toHaveBeenCalledWith(
    "langfuse.topics.publication_checks",
    1,
    { check: "assignments", outcome: "visible_after_retry" },
  );
});

it("throws the last read error after every retry failed and reports it", async () => {
  const read = vi
    .fn<() => Promise<number>>()
    .mockRejectedValue(new Error("timeout"));
  const result = readUntilVisible("definitions", context, read, () => true);
  const rejected = expect(result).rejects.toThrow("timeout");
  await vi.runAllTimersAsync();
  await rejected;
  expect(read).toHaveBeenCalledTimes(6);
  expect(mocks.recordIncrement).toHaveBeenCalledWith(
    "langfuse.topics.publication_checks",
    1,
    { check: "definitions", outcome: "read_failed" },
  );
});

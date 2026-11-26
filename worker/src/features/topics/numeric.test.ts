import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { runTopicClustering, topicClusterSettings } from "./numeric";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function numericalChild(output: (count: number) => string) {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn((): boolean => child.emit("close", null)),
  });
  child.stdin.on("data", (data: Buffer) => {
    const request = JSON.parse(data.toString()) as { embeddings: number[][] };
    child.stdout.write(output(request.embeddings.length));
    child.emit("close", 0);
  });
  vi.mocked(spawn).mockReturnValue(
    child as unknown as ReturnType<typeof spawn>,
  );
  return child;
}

it("reports oversized child output explicitly instead of accepting a partial cohort", async () => {
  const child = numericalChild((count) => " ".repeat(4097 + count * 256));
  await expect(
    runTopicClustering(
      Array.from({ length: 100 }, () => [1, 0]),
      topicClusterSettings(false),
    ),
  ).rejects.toThrow("oversized output");
  expect(child.kill).toHaveBeenCalledWith("SIGKILL");
});

it("kills a stalled fit and reports the deadline even if close fires immediately", async () => {
  vi.useFakeTimers();
  const child = numericalChild(() => "");
  child.stdin.removeAllListeners("data");
  const pending = runTopicClustering(
    Array.from({ length: 100 }, () => [1, 0]),
    topicClusterSettings(false),
  );
  expect(vi.mocked(spawn).mock.calls[0][2]?.env).toEqual({
    NODE_ENV: "production",
  });
  const rejection = pending.catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(await rejection).toEqual(
    new Error("Topics numerical fit exceeded 120 seconds"),
  );
  expect(child.kill).toHaveBeenCalledWith("SIGKILL");
});

it("rejects truncated populations", async () => {
  numericalChild(() =>
    JSON.stringify({ status: "complete", labels: [0], coordinates: [[0, 0]] }),
  );
  const vectors = Array.from({ length: 100 }, () => [1, 0]);
  await expect(
    runTopicClustering(vectors, topicClusterSettings(false)),
  ).rejects.toThrow("population mismatch");
});

it("does not start a child or deadline if the request cannot be serialized", async () => {
  vi.useFakeTimers();
  numericalChild(() => "");
  const vectors = Array.from({ length: 100 }, () => [1, 0]);
  vi.spyOn(JSON, "stringify").mockImplementationOnce(() => {
    throw new RangeError("Invalid string length");
  });
  await expect(
    runTopicClustering(vectors, topicClusterSettings(false)),
  ).rejects.toThrow("Invalid string length");
  expect(spawn).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

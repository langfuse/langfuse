import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { expect, it, vi } from "vitest";
import { runTopicClustering } from "./numeric";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

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

it("passes every member of a cohort larger than 1000 to the numerical stage", async () => {
  numericalChild((count) =>
    JSON.stringify({
      status: "complete",
      labels: Array(count).fill(0),
      coordinates: Array(count).fill([0, 0]),
    }),
  );
  const result = await runTopicClustering(
    Array.from({ length: 1002 }, () => [1, 0]),
    false,
  );
  expect(result.labels).toHaveLength(1002);
  expect(result.coordinates).toHaveLength(1002);
});

it("reports oversized child output explicitly instead of accepting a partial cohort", async () => {
  const child = numericalChild((count) => " ".repeat(4097 + count * 256));
  await expect(
    runTopicClustering(
      Array.from({ length: 100 }, () => [1, 0]),
      false,
    ),
  ).rejects.toThrow("oversized output");
  expect(child.kill).toHaveBeenCalledWith("SIGKILL");
});

import { setTimeout as sleep } from "node:timers/promises";

export type OtelIngestionWorkerRequest =
  | { type: "warmup" }
  | { type: "shadow"; durationMs: number };

export type OtelIngestionWorkerResult = { kind: "warmup" } | { kind: "shadow" };

export default async function runOtelIngestionWorker(
  request: OtelIngestionWorkerRequest,
): Promise<OtelIngestionWorkerResult> {
  if (request.type === "warmup") {
    return { kind: "warmup" };
  }

  await sleep(request.durationMs);
  return { kind: "shadow" };
}

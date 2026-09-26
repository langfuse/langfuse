import { setTimeout as sleep } from "node:timers/promises";

import dd from "dd-trace";
import {
  processOtelIngestion,
  type OtelIngestionRequest,
  type OtelIngestionResult,
} from "./processOtelIngestion";

dd.init({
  plugins: false,
  runtimeMetrics: false,
});

export type OtelIngestionWorkerRequest =
  | (Omit<OtelIngestionRequest, "body"> & {
      body: Uint8Array<ArrayBuffer>;
    })
  | { type: "warmup" }
  | { type: "shadow"; durationMs: number };

export type OtelIngestionWorkerResult =
  | OtelIngestionResult
  | {
      kind: "warmup";
    }
  | {
      kind: "shadow";
    };

export default function processOtelIngestionInWorker(
  request: OtelIngestionWorkerRequest,
): Promise<OtelIngestionWorkerResult> {
  if (!("body" in request)) {
    if (request.type === "warmup") {
      return Promise.resolve({ kind: "warmup" });
    }

    return sleep(request.durationMs).then(() => ({ kind: "shadow" }));
  }

  const body = Buffer.from(
    request.body.buffer,
    request.body.byteOffset,
    request.body.byteLength,
  );

  return processOtelIngestion({ ...request, body }).then((result) => {
    if (
      result.kind === "ok" &&
      result.body &&
      typeof result.body === "object" &&
      "toJSON" in result.body &&
      typeof result.body.toJSON === "function"
    ) {
      return { ...result, body: JSON.parse(JSON.stringify(result.body)) };
    }

    return result;
  });
}

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
  | { type: "warmup" };

export type OtelIngestionWorkerResult =
  | OtelIngestionResult
  | {
      kind: "warmup";
    };

export default function processOtelIngestionInWorker(
  request: OtelIngestionWorkerRequest,
): Promise<OtelIngestionWorkerResult> {
  if (!("body" in request)) {
    return Promise.resolve({ kind: "warmup" });
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

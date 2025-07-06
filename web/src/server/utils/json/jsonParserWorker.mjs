// To not blow up testing complexity and dig further into setup troubles, this is a plain mjs file
// Prod version should be TypeScript an re-use utilities

import { parentPort } from "worker_threads";
import { performance } from "perf_hooks";
import { parse, isSafeNumber, isNumber } from "lossless-json";

// Taken from packages/shared/src/utils/json.ts
function parseJsonPrioritised(json) {
  try {
    return parse(json, null, (value) => {
      if (isNumber(value)) {
        if (isSafeNumber(value)) {
          // Safe numbers (integers and decimals) can be converted to Number
          return Number(value.valueOf());
        } else {
          // For large integers beyond safe limits, preserve string representation
          return value.toString();
        }
      }
      return value;
    });
  } catch (error) {
    return json;
  }
}

// Taken from packages/shared/src/server/utils/metadata_conversion.ts
export function parseRecord(metadata) {
  return metadata
    ? Object.fromEntries(
        Object.entries(metadata ?? {}).map(([key, val]) => [
          key,
          val === null ? null : parseJsonPrioritised(val),
        ]),
      )
    : {};
}

if (!parentPort) {
  // This check is mainly for type safety, as this file is only intended to be run as a worker.
  throw new Error("This file is meant to be run as a worker thread.");
}

parentPort.on("message", (message) => {
  try {
    const startTime = performance.now();

    // Handle both old format (direct string/object) and new format (with config)
    const jsonStringOrObject = message?.data ?? message;
    const shouldStringify = message?.stringify !== false; // Default to true for backwards compatibility

    const parsed =
      typeof jsonStringOrObject == "string"
        ? parseJsonPrioritised(jsonStringOrObject)
        : parseRecord(jsonStringOrObject);

    const result = shouldStringify ? JSON.stringify(parsed) : parsed;
    const endTime = performance.now();
    const workerCpuTime = endTime - startTime;

    parentPort.postMessage({ success: true, data: result, workerCpuTime });
  } catch (e) {
    parentPort.postMessage({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

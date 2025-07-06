// @ts-nocheck

import { parentPort } from "worker_threads";
import { performance } from "perf_hooks";
import { parse, isSafeNumber, isNumber } from "lossless-json";

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

if (!parentPort) {
  // This check is mainly for type safety, as this file is only intended to be run as a worker.
  throw new Error("This file is meant to be run as a worker thread.");
}

parentPort.on("message", (jsonString) => {
  try {
    const startTime = performance.now();
    const parsed = parseJsonPrioritised(jsonString);
    const result = JSON.stringify(parsed);
    const endTime = performance.now();
    const workerCpuTime = endTime - startTime;

    parentPort.postMessage({ success: true, data: result, workerCpuTime });
  } catch (e) {
    parentPort.postMessage({ success: false, error: e.message });
  }
});

import { parseJsonPrioritised } from "@langfuse/shared";
import { parentPort } from "worker_threads";

if (!parentPort) {
  throw new Error("This file is meant to be run as a worker thread.");
}

parentPort.on("message", (jsonString) => {
  try {
    const parsed = parseJsonPrioritised(jsonString);
    // We stringify it again to send it back, as structured cloning is used
    // and we want to simulate the full work of parsing and preparing for response.
    const result = JSON.stringify(parsed);
    parentPort.postMessage({ success: true, data: result });
  } catch (e) {
    parentPort.postMessage({ success: false, error: e.message });
  }
});

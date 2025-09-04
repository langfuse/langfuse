// Ensure to keep this file 100% compatible with worker-thread.ts

const { parentPort } = require("worker_threads");
const { tokenCount } = require("../../../dist/features/tokenisation/usage.js");

// Worker thread entry point
if (parentPort) {
  parentPort.on("message", (data) => {
    try {
      const result = tokenCount({ model: data.model, text: data.text });
      parentPort.postMessage({ id: data.id, result, error: null });
    } catch (error) {
      parentPort.postMessage({
        id: data.id,
        result: undefined,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}

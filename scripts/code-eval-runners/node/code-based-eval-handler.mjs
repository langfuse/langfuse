import { stripTypeScriptTypes } from "node:module";
import { Worker } from "node:worker_threads";

const WORKER_SOURCE = `
import { parentPort, workerData } from "node:worker_threads";

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

(async () => {
  const moduleUrl =
    "data:text/javascript;base64," +
    Buffer.from(workerData.source).toString("base64");

  let evaluate;
  try {
    const module = await import(moduleUrl);
    evaluate = module.evaluate;
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      code: "INVALID_SOURCE",
      message: "Failed to load evaluator source: " + formatError(error),
    });
    return;
  }

  if (typeof evaluate !== "function") {
    parentPort.postMessage({
      ok: false,
      code: "INVALID_SOURCE",
      message: "Evaluator source must export an evaluate(ctx) function",
    });
    return;
  }

  try {
    const result = await evaluate(workerData.payload);
    parentPort.postMessage({ ok: true, result });
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      code: "USER_CODE_ERROR",
      message: formatError(error),
    });
  }
})();
`;

export async function handler(event) {
  let source;
  try {
    source = stripTypeScriptTypes(event.code.source, { mode: "strip" });
  } catch (error) {
    return runnerError(
      "INVALID_SOURCE",
      `Failed to strip TypeScript syntax: ${formatError(error)}`,
    );
  }

  let message;
  try {
    message = await runInWorker({ source, payload: event.payload });
  } catch (error) {
    return runnerError("USER_CODE_ERROR", formatError(error));
  }

  if (!message.ok) {
    return runnerError(message.code, message.message);
  }

  return normalizeResult(message.result);
}

function runInWorker(workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL(
        `data:text/javascript;base64,${Buffer.from(WORKER_SOURCE).toString("base64")}`,
      ),
      { workerData },
    );
    let settled = false;

    const cleanup = () => {
      settled = true;
      void worker.terminate();
    };

    worker.once("message", (message) => {
      cleanup();
      resolve(message);
    });

    worker.once("error", (error) => {
      cleanup();
      reject(error);
    });

    worker.once("exit", (exitCode) => {
      if (settled) return;
      reject(
        new Error(
          `Code eval worker exited with code ${exitCode} before returning a result`,
        ),
      );
    });
  });
}

function normalizeResult(result) {
  if (
    typeof result !== "object" ||
    result === null ||
    !Array.isArray(result.scores)
  ) {
    return runnerError(
      "INVALID_RESULT",
      "Evaluator must return an object shaped like { scores: [...] }",
    );
  }

  return result;
}

function runnerError(code, message) {
  return {
    error: {
      code,
      message,
    },
  };
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

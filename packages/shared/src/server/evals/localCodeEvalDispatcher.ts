import { stripTypeScriptTypes } from "node:module";
import { Worker } from "node:worker_threads";
import { env } from "../../env";
import {
  CodeEvalDispatcherError,
  parseDispatchResult,
  type CodeEvalDispatcher,
  type CodeEvalDispatcherErrorCode,
  type DispatchInput,
  type DispatchResult,
} from "./codeEvalDispatcherTypes";

// Each dispatch runs the evaluator in a fresh worker thread so that Node's
// ESM loader registry (which has no public eviction API) is GC'd with the
// worker on termination, instead of leaking the user-supplied source +
// parsed module on every invocation.
const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");

(async () => {
  const moduleUrl =
    "data:text/javascript;base64," +
    Buffer.from(workerData.source).toString("base64");

  let mod;
  try {
    mod = await import(moduleUrl);
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      code: "INVALID_SOURCE",
      message: "Failed to load evaluator source: " + (error && error.message ? error.message : String(error)),
    });
    return;
  }

  if (typeof mod.evaluate !== "function") {
    parentPort.postMessage({
      ok: false,
      code: "INVALID_SOURCE",
      message: "Evaluator source must export an evaluate(ctx) function",
    });
    return;
  }

  try {
    const result = await mod.evaluate(workerData.payload);
    parentPort.postMessage({ ok: true, result });
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      code: "USER_CODE_ERROR",
      message: error && error.message ? error.message : String(error),
    });
  }
})();
`;

type WorkerSuccess = { ok: true; result: unknown };
type WorkerFailure = {
  ok: false;
  code: Extract<
    CodeEvalDispatcherErrorCode,
    "INVALID_SOURCE" | "USER_CODE_ERROR"
  >;
  message: string;
};
type WorkerMessage = WorkerSuccess | WorkerFailure;

export class LocalCodeEvalDispatcher implements CodeEvalDispatcher {
  public readonly name = "local";
  private readonly timeoutMs: number;

  constructor(params?: { timeoutMs?: number }) {
    this.timeoutMs =
      params?.timeoutMs ?? env.LANGFUSE_CODE_EVAL_LOCAL_TIMEOUT_MS;
  }

  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    if (input.runtime.language !== "TYPESCRIPT") {
      throw new CodeEvalDispatcherError(
        "Local code eval dispatcher only supports TypeScript/JavaScript evaluators",
        { code: "UNSUPPORTED_RUNTIME" },
      );
    }

    let source: string;
    try {
      source = stripTypeScriptTypes(input.code.source, { mode: "strip" });
    } catch (error) {
      throw new CodeEvalDispatcherError(
        `Failed to strip TypeScript syntax: ${error instanceof Error ? error.message : String(error)}`,
        { code: "INVALID_SOURCE", cause: error },
      );
    }

    const message = await runInWorker(
      { source, payload: input.payload },
      this.timeoutMs,
    );

    if (!message.ok) {
      throw new CodeEvalDispatcherError(message.message, {
        code: message.code,
      });
    }

    return parseDispatchResult(message.result);
  }
}

function runInWorker(
  workerData: {
    source: string;
    payload: unknown;
  },
  timeoutMs: number,
): Promise<WorkerMessage> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, { eval: true, workerData });
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      cleanup();
      reject(
        new CodeEvalDispatcherError("Local code eval execution timed out", {
          code: "TIMEOUT",
          retryable: true,
        }),
      );
    }, timeoutMs);

    const cleanup = () => {
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
    };

    worker.once("message", (msg: WorkerMessage) => {
      if (settled) return;
      cleanup();
      resolve(msg);
    });

    // Worker-level error: worker startup or unhandled rejection escaping
    // the IIFE. The in-worker try/catch above covers the common paths, so
    // hitting this branch usually means the runtime itself crashed.
    worker.once("error", (error) => {
      if (settled) return;
      cleanup();
      reject(
        new CodeEvalDispatcherError(
          `Local code eval worker crashed: ${error.message}`,
          { code: "INVALID_SOURCE", cause: error },
        ),
      );
    });

    // Worker exits without posting a message (e.g. user code calls
    // process.exit()). Surface as a user-code error rather than hanging.
    worker.once("exit", (exitCode) => {
      if (settled) return;
      cleanup();
      reject(
        new CodeEvalDispatcherError(
          `Local code eval worker exited with code ${exitCode} before returning a result`,
          { code: "USER_CODE_ERROR" },
        ),
      );
    });
  });
}

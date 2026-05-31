import { stripTypeScriptTypes } from "node:module";
import * as vm from "node:vm";
import { env } from "../../env";
import {
  CodeEvalDispatcherError,
  CodeEvalDispatcherErrorCodes,
  parseDispatchResult,
  withCodeEvalDocs,
  type CodeEvalDispatcher,
  type DispatchInput,
  type DispatchResult,
} from "./codeEvalDispatcherTypes";

const SCRIPT_TIMEOUT_MESSAGE = "Script execution timed out";

export class LocalCodeEvalDispatcher implements CodeEvalDispatcher {
  public readonly name = "insecure-local";
  private readonly timeoutMs: number;

  constructor(params?: { timeoutMs?: number }) {
    this.timeoutMs =
      params?.timeoutMs ?? env.LANGFUSE_CODE_EVAL_LOCAL_TIMEOUT_MS;
  }

  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    if (input.runtime.language !== "TYPESCRIPT") {
      throw new CodeEvalDispatcherError(
        "Local code eval dispatcher only supports TypeScript/JavaScript evaluators",
        { code: CodeEvalDispatcherErrorCodes.UNSUPPORTED_RUNTIME },
      );
    }

    let source: string;
    try {
      source = stripTypeScriptTypes(input.code.source, { mode: "strip" });
    } catch (error) {
      throw new CodeEvalDispatcherError(
        `Failed to strip TypeScript syntax: ${withCodeEvalDocs(formatError(error))}`,
        { code: CodeEvalDispatcherErrorCodes.INVALID_SOURCE, cause: error },
      );
    }

    const context = vm.createContext({
      payload: input.payload,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      queueMicrotask,
      structuredClone,
      TextEncoder,
      TextDecoder,
      URL,
      URLSearchParams,
    });
    try {
      vm.runInContext(
        `${source}

if (typeof evaluate !== "function") {
  throw new Error("Evaluator source must define evaluate(ctx)");
}`,
        context,
        { timeout: this.timeoutMs },
      );
    } catch (error) {
      throw new CodeEvalDispatcherError(
        `Failed to prepare evaluator source: ${formatError(error)}`,
        { code: CodeEvalDispatcherErrorCodes.INVALID_SOURCE, cause: error },
      );
    }

    let result: unknown;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const evaluatorResult = vm.runInContext("evaluate(payload)", context, {
        timeout: this.timeoutMs,
      });

      result = await Promise.race([
        evaluatorResult,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () =>
              reject(
                new Error(
                  `${SCRIPT_TIMEOUT_MESSAGE} after ${this.timeoutMs}ms`,
                ),
              ),
            this.timeoutMs,
          );
        }),
      ]);
    } catch (error) {
      const message = formatError(error);
      throw new CodeEvalDispatcherError(message, {
        code: message.includes(SCRIPT_TIMEOUT_MESSAGE)
          ? CodeEvalDispatcherErrorCodes.TIMEOUT
          : CodeEvalDispatcherErrorCodes.USER_CODE_ERROR,
        cause: error,
        retryable: message.includes(SCRIPT_TIMEOUT_MESSAGE),
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    return parseDispatchResult(result);
  }
}

function formatError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return String(error);
}

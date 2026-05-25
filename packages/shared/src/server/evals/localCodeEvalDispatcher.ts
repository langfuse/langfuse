import { stripTypeScriptTypes } from "node:module";
import * as vm from "node:vm";
import { env } from "../../env";
import {
  CodeEvalDispatcherError,
  CodeEvalDispatcherErrorCodes,
  parseDispatchResult,
  type CodeEvalDispatcher,
  type DispatchInput,
  type DispatchResult,
} from "./codeEvalDispatcherTypes";

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
        `Failed to strip TypeScript syntax: ${error instanceof Error ? error.message : String(error)}`,
        { code: CodeEvalDispatcherErrorCodes.INVALID_SOURCE, cause: error },
      );
    }

    const context = vm.createContext({ payload: input.payload });
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
        `Failed to prepare evaluator source: ${error instanceof Error ? error.message : String(error)}`,
        { code: CodeEvalDispatcherErrorCodes.INVALID_SOURCE, cause: error },
      );
    }

    let result: unknown;
    try {
      result = await vm.runInContext("evaluate(payload)", context, {
        timeout: this.timeoutMs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CodeEvalDispatcherError(message, {
        code: message.includes("Script execution timed out")
          ? CodeEvalDispatcherErrorCodes.TIMEOUT
          : CodeEvalDispatcherErrorCodes.USER_CODE_ERROR,
        cause: error,
        retryable: message.includes("Script execution timed out"),
      });
    }

    return parseDispatchResult(result);
  }
}

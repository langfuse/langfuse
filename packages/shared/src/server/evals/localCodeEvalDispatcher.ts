import { stripTypeScriptTypes } from "node:module";
import {
  CodeEvalDispatcherError,
  parseDispatchResult,
  type CodeEvalDispatcher,
  type DispatchInput,
  type DispatchResult,
} from "./codeEvalDispatcherTypes";

export class LocalCodeEvalDispatcher implements CodeEvalDispatcher {
  public readonly name = "local";

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

    let evaluate: unknown;
    try {
      const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${input.execution.jobExecutionId}-${Date.now()}`;
      const module = (await import(moduleUrl)) as { evaluate?: unknown };
      evaluate = module.evaluate;
    } catch (error) {
      throw new CodeEvalDispatcherError(
        `Failed to load evaluator source: ${error instanceof Error ? error.message : String(error)}`,
        { code: "INVALID_SOURCE", cause: error },
      );
    }

    if (typeof evaluate !== "function") {
      throw new CodeEvalDispatcherError(
        "Evaluator source must export an evaluate(ctx) function",
        { code: "INVALID_SOURCE" },
      );
    }

    let result: unknown;
    try {
      result = await evaluate(input.payload);
    } catch (error) {
      throw new CodeEvalDispatcherError(
        `Evaluator execution failed: ${error instanceof Error ? error.message : String(error)}`,
        { code: "USER_CODE_ERROR", cause: error },
      );
    }

    return parseDispatchResult(result);
  }
}

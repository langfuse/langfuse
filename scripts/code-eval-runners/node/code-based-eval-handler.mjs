import { stripTypeScriptTypes } from "node:module";

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

  let evaluate;
  try {
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${event.execution.jobExecutionId}-${Date.now()}`;
    const module = await import(moduleUrl);
    evaluate = module.evaluate;
  } catch (error) {
    return runnerError(
      "INVALID_SOURCE",
      `Failed to load evaluator source: ${formatError(error)}`,
    );
  }

  if (typeof evaluate !== "function") {
    return runnerError(
      "INVALID_SOURCE",
      "Evaluator source must export an evaluate(ctx) function",
    );
  }

  let result;
  try {
    result = await evaluate(event.payload);
  } catch (error) {
    return runnerError("USER_CODE_ERROR", formatError(error));
  }

  return normalizeResult(result);
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

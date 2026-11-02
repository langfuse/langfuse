import { stripTypeScriptTypes } from "node:module";

const CODE_EVAL_DOCS_URL =
  "https://langfuse.com/docs/evaluation/evaluation-methods/code-evaluators";

// `stripTypeScriptTypes` is loaded lazily - we call it hear to avoid doing the import in the call itself
stripTypeScriptTypes("");

export async function handler(event) {
  let source;
  try {
    source = stripTypeScriptTypes(event.code.source, { mode: "strip" });
  } catch (error) {
    return runnerError(
      "INVALID_SOURCE",
      `Failed to strip TypeScript syntax: ${withCodeEvalDocs(formatError(error))}`,
    );
  }

  let evaluate;
  try {
    evaluate = Function(
      `${source}

if (typeof evaluate !== "function") {
  throw new Error("Evaluator source must define evaluate(ctx)");
}

return evaluate;`,
    )();
  } catch (error) {
    return runnerError(
      "INVALID_SOURCE",
      `Failed to prepare evaluator source: ${formatError(error)}`,
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
  if (error instanceof Error) {
    if (!error.message) return error.name || "Error";
    // "Error" carries no signal; other names (TypeError, RangeError, custom
    // classes) tell the evaluator author what went wrong.
    return error.name && error.name !== "Error"
      ? `${error.name}: ${error.message}`
      : error.message;
  }

  return String(error);
}

function withCodeEvalDocs(message) {
  const trimmedMessage = message.trim();
  const punctuatedMessage = /[.!?]$/.test(trimmedMessage)
    ? trimmedMessage
    : `${trimmedMessage}.`;

  return `${punctuatedMessage} See ${CODE_EVAL_DOCS_URL} for details.`;
}

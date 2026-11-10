import { env } from "../../env";
import { logger } from "../logger";
import { AwsLambdaCodeEvalDispatcher } from "./awsLambdaCodeEvalDispatcher";
import { ExternalCodeEvalDispatcher } from "./externalCodeEvalDispatcher";
import { LocalCodeEvalDispatcher } from "./localCodeEvalDispatcher";
import type { CodeEvalDispatcher } from "./codeEvalDispatcherTypes";

export * from "./awsLambdaCodeEvalDispatcher";
export * from "./codeEvalDispatcherTypes";
export * from "./localCodeEvalDispatcher";

let hasLoggedInsecureLocalWarning = false;

export function resolveConfiguredCodeEvalDispatcher(): CodeEvalDispatcher | null {
  const dispatcherName =
    env.LANGFUSE_CODE_EVAL_DISPATCHER ??
    (env.NODE_ENV === "development" || env.NODE_ENV === "test"
      ? "insecure-local"
      : undefined);

  if (!dispatcherName) return null;

  if (dispatcherName === "insecure-local") {
    if (!hasLoggedInsecureLocalWarning) {
      logger.warn(
        "Using the `insecure-local` code-eval dispatcher. Code evals will execute user-provided code in the worker process. Only use this with trusted code, local development, or tests.",
      );
      hasLoggedInsecureLocalWarning = true;
    }
    return new LocalCodeEvalDispatcher();
  }

  if (dispatcherName === "aws-lambda") {
    return new AwsLambdaCodeEvalDispatcher({
      endpoint: env.LANGFUSE_CODE_EVAL_AWS_LAMBDA_ENDPOINT,
      functionNameByLanguage: {
        PYTHON: env.LANGFUSE_CODE_EVAL_AWS_LAMBDA_PYTHON_FUNCTION_NAME,
        TYPESCRIPT: env.LANGFUSE_CODE_EVAL_AWS_LAMBDA_NODE_FUNCTION_NAME,
      },
    });
  }

  if (dispatcherName === "external") {
    const endpoint = env.LANGFUSE_CODE_EVAL_EXTERNAL_ENDPOINT;
    const signingSecret = env.LANGFUSE_CODE_EVAL_EXTERNAL_SIGNING_SECRET;
    // Env validation enforces both, except in Docker builds that skip it.
    if (!endpoint || !signingSecret) {
      throw new Error(
        "LANGFUSE_CODE_EVAL_EXTERNAL_ENDPOINT and LANGFUSE_CODE_EVAL_EXTERNAL_SIGNING_SECRET are required for the external code-eval dispatcher",
      );
    }
    return new ExternalCodeEvalDispatcher({
      endpoint,
      signingSecret,
      headers: env.LANGFUSE_CODE_EVAL_EXTERNAL_HEADERS,
      timeoutMs: env.LANGFUSE_CODE_EVAL_EXTERNAL_TIMEOUT_MS,
      connectTimeoutMs: env.LANGFUSE_CODE_EVAL_EXTERNAL_CONNECT_TIMEOUT_MS,
      maxAttempts: env.LANGFUSE_CODE_EVAL_EXTERNAL_MAX_ATTEMPTS,
      languages: env.LANGFUSE_CODE_EVAL_EXTERNAL_LANGUAGES,
    });
  }

  return null;
}

import { env } from "../../env";
import { logger } from "../logger";
import { AwsLambdaCodeEvalDispatcher } from "./awsLambdaCodeEvalDispatcher";
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

  return null;
}

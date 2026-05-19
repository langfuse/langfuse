import { env } from "../../env";
import { AwsLambdaCodeEvalDispatcher } from "./awsLambdaCodeEvalDispatcher";
import { LocalCodeEvalDispatcher } from "./localCodeEvalDispatcher";
import type { CodeEvalDispatcher } from "./codeEvalDispatcherTypes";

export * from "./awsLambdaCodeEvalDispatcher";
export * from "./codeEvalDispatcherTypes";
export * from "./localCodeEvalDispatcher";

export function resolveConfiguredCodeEvalDispatcher(): CodeEvalDispatcher | null {
  const dispatcherName =
    env.LANGFUSE_CODE_EVAL_DISPATCHER ??
    (env.NODE_ENV === "development" ? "local" : undefined);

  if (!dispatcherName) return null;

  if (dispatcherName === "local") return new LocalCodeEvalDispatcher();
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

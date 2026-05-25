import { env } from "@/src/env.mjs";

export function isCodeEvalEnabled(): boolean {
  return Boolean(
    Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) &&
    env.NEXT_PUBLIC_LANGFUSE_CODE_EVAL_ENABLED === "true",
  );
}

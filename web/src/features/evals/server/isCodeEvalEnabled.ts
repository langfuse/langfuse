import { env } from "@/src/env.mjs";

export function isCodeEvalEnabled(): boolean {
  return env.NEXT_PUBLIC_LANGFUSE_CODE_EVAL_ENABLED === "true";
}

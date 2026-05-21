import { env } from "@/src/env.mjs";

export function useIsCodeEvalEnabled(): { enabled: boolean } {
  return {
    enabled: env.NEXT_PUBLIC_LANGFUSE_CODE_EVAL_ENABLED === "true",
  };
}

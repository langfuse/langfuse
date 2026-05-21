import { env } from "@/src/env.mjs";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

export function useIsCodeEvalEnabled(): { enabled: boolean } {
  const { isBetaEnabled } = useV4Beta();

  return {
    enabled:
      env.NEXT_PUBLIC_LANGFUSE_CODE_EVAL_ENABLED === "true" && isBetaEnabled,
  };
}

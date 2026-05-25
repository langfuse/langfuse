import { env } from "@/src/env.mjs";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

export function useIsCodeEvalEnabled(): { enabled: boolean } {
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { isBetaEnabled } = useV4Beta();

  return {
    enabled:
      isLangfuseCloud &&
      isBetaEnabled &&
      env.NEXT_PUBLIC_LANGFUSE_CODE_EVAL_ENABLED === "true",
  };
}

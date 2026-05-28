import { isCodeEvalEnabled } from "@/src/features/evals/server/isCodeEvalEnabled";

export function useIsCodeEvalEnabled(): { enabled: boolean } {
  return {
    enabled: isCodeEvalEnabled(),
  };
}

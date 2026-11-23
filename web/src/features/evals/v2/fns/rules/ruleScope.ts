import { TopicsTargetObject } from "@langfuse/shared";

import type { RuleScope } from "@/src/features/evals/v2/types/rules";

export function ruleScopeOf(targetObject: unknown): RuleScope {
  return String(targetObject) === TopicsTargetObject ? "trace" : "observation";
}

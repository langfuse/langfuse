import {
  QUICK_ACTION_CATEGORY_CONTEXT_DESCRIPTION,
  QUICK_ACTION_KEY_CONTEXT_DESCRIPTION,
  type InAppAgentQuickActionAttribution,
} from "@/src/features/in-app-agent/types";
import { type AgUiRunAgentInput } from "@langfuse/shared/in-app-agent";

type InAppAgentContext = AgUiRunAgentInput["context"];

export function createInAppAgentQuickActionAttributionContext(
  attribution: InAppAgentQuickActionAttribution,
): InAppAgentContext {
  return [
    {
      description: QUICK_ACTION_KEY_CONTEXT_DESCRIPTION,
      value: attribution.key,
    },
    {
      description: QUICK_ACTION_CATEGORY_CONTEXT_DESCRIPTION,
      value: attribution.category,
    },
  ];
}

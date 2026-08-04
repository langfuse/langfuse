import {
  IN_APP_AGENT_QUICK_ACTION_CONTEXTS,
  type InAppAgentQuickActionContext,
} from "@/src/features/in-app-agent/types";

export function isInAppAgentQuickActionContext(
  value: string,
): value is InAppAgentQuickActionContext {
  return IN_APP_AGENT_QUICK_ACTION_CONTEXTS.some(
    (context) => context === value,
  );
}

import type { InAppAgentQuickActionContext } from "@/src/features/in-app-agent/types";
import { IN_APP_AGENT_QUICK_ACTION_CONTEXTS } from "@/src/features/in-app-agent/constants";

export function isInAppAgentQuickActionContext(
  value: string,
): value is InAppAgentQuickActionContext {
  return IN_APP_AGENT_QUICK_ACTION_CONTEXTS.some(
    (context) => context === value,
  );
}

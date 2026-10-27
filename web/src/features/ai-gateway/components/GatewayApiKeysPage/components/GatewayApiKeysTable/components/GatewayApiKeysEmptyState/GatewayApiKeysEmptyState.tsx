import { KeyRound } from "@langfuse/icons";

import { GatewaySetupEmptyState } from "@/src/features/ai-gateway/components/GatewaySetupEmptyState/GatewaySetupEmptyState";

export function GatewayApiKeysEmptyState() {
  return (
    <GatewaySetupEmptyState
      icon={KeyRound}
      title="No gateway API keys yet"
      description="Create a key to send requests through the AI Gateway from Claude Code, Codex, or your own code."
    />
  );
}

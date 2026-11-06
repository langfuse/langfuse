import { Lock } from "@langfuse/icons";

import { GatewaySetupEmptyState } from "@/src/features/ai-gateway/components/GatewaySetupEmptyState/GatewaySetupEmptyState";

export function GatewayNotSetUpNotice() {
  return (
    <GatewaySetupEmptyState
      icon={Lock}
      title="The AI Gateway isn't set up yet"
      description="Ask your organization admin to set up the AI Gateway."
    />
  );
}

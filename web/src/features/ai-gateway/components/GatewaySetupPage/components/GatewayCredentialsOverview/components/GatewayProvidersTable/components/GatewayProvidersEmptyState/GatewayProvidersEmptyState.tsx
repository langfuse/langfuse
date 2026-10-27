import { Plug } from "@langfuse/icons";

import { GatewaySetupEmptyState } from "@/src/features/ai-gateway/components/GatewaySetupEmptyState/GatewaySetupEmptyState";

export function GatewayProvidersEmptyState() {
  return (
    <GatewaySetupEmptyState
      icon={Plug}
      title="No providers set up yet"
      description="Add an OpenAI or Anthropic credential so the gateway can route requests and discover models."
    />
  );
}

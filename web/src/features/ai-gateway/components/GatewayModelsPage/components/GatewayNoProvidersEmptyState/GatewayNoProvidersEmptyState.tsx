import { Plug, Plus } from "@langfuse/icons";

import { GatewaySetupEmptyState } from "@/src/features/ai-gateway/components/GatewaySetupEmptyState/GatewaySetupEmptyState";

export type GatewayNoProvidersEmptyStateProps = {
  /** Omit for members who cannot add provider credentials. */
  onAddProvider?: () => void;
};

export function GatewayNoProvidersEmptyState({
  onAddProvider,
}: GatewayNoProvidersEmptyStateProps) {
  if (!onAddProvider) {
    return (
      <GatewaySetupEmptyState
        icon={Plug}
        title="No providers yet"
        description="Ask your organization admin to add a provider so the gateway can route requests."
      />
    );
  }
  return (
    <GatewaySetupEmptyState
      icon={Plug}
      title="No providers yet"
      description="Add an OpenAI or Anthropic credential so the gateway can route requests and discover models."
      actions={[
        {
          type: "button",
          label: "Add provider",
          icon: Plus,
          onClick: onAddProvider,
        },
      ]}
    />
  );
}

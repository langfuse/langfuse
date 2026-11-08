import { BookOpen, KeyRound } from "@langfuse/icons";

import { GatewaySetupEmptyState } from "@/src/features/ai-gateway/components/GatewaySetupEmptyState/GatewaySetupEmptyState";

export function GatewayAnalyticsNoKeysEmptyState({
  gatewayKeysHref,
  docsHref,
}: {
  gatewayKeysHref: string;
  docsHref: string;
}) {
  return (
    <GatewaySetupEmptyState
      icon={KeyRound}
      title="Send your first request"
      description="Cost and usage show up here once requests go through the AI Gateway. Add a gateway key, then point your LLM client at the gateway."
      actions={[
        {
          type: "link",
          label: "Add gateway key",
          href: gatewayKeysHref,
          icon: KeyRound,
          variant: "primary",
        },
        {
          type: "link",
          label: "Read the docs",
          href: docsHref,
          icon: BookOpen,
        },
      ]}
    />
  );
}

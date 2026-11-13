import { BookOpen } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { getGatewaySetupHeroProviders } from "@/src/features/ai-gateway/components/GatewayOverviewPage/fns/getGatewaySetupHeroProviders";
import { GatewayIdleDiagram } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayIdleDiagram";
import { GatewayPlaceholder } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayPlaceholder";
import { GATEWAY_SELF_HOSTING_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";

/** Shown to managers on self-hosted Langfuse while the gateway service is not deployed. */
export function GatewayNotDeployedNotice() {
  return (
    <GatewayPlaceholder.Frame
      title="AI Gateway isn’t deployed"
      description="On self-hosted Langfuse, the AI Gateway runs as a separate service. Deploy it next to your Langfuse instance to configure provider connections, models and gateway keys."
    >
      <Button
        variant="outline"
        text="Self-hosting guide"
        icon={BookOpen}
        href={GATEWAY_SELF_HOSTING_DOCS_URL}
      />
      <GatewayIdleDiagram
        providers={getGatewaySetupHeroProviders(new Set())}
        label="Not deployed"
      />
    </GatewayPlaceholder.Frame>
  );
}

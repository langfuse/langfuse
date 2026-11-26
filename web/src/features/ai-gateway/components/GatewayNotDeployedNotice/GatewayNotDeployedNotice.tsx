import { Button } from "@/src/components/design-system/Button/Button";
import { GatewayTrafficDiagram } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayTrafficDiagram";
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
        href={GATEWAY_SELF_HOSTING_DOCS_URL}
      />
      <GatewayTrafficDiagram />
    </GatewayPlaceholder.Frame>
  );
}

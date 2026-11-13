import { BookOpen } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { GatewayPlaceholder } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayPlaceholder";
import { GATEWAY_MODELS_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { NoProvidersDiagram } from "./components/NoProvidersDiagram";

/** Shown to members who cannot add provider credentials. */
export function GatewayNoProvidersReadOnlyEmptyState() {
  return (
    <GatewayPlaceholder.Frame
      title="No connections yet"
      description="Ask your organization admin to add a connection so the gateway can route requests."
    >
      <GatewayPlaceholder.Actions>
        <Button
          variant="outline"
          text="About gateway models"
          icon={BookOpen}
          href={GATEWAY_MODELS_DOCS_URL}
        />
      </GatewayPlaceholder.Actions>
      <NoProvidersDiagram />
    </GatewayPlaceholder.Frame>
  );
}

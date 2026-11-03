import { Server } from "@langfuse/icons";

import Header from "@/src/components/layouts/header";
import { GatewaySetupEmptyState } from "@/src/features/ai-gateway/components/GatewaySetupEmptyState/GatewaySetupEmptyState";
import { GATEWAY_SELF_HOSTING_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";

export function GatewayNotDeployedNotice() {
  return (
    <div className="flex flex-col gap-4">
      <Header title="Gateway setup" />
      <GatewaySetupEmptyState
        icon={Server}
        title="The AI Gateway isn't deployed"
        description="On self-hosted Langfuse, the AI Gateway runs as a separate service. Deploy it next to your Langfuse instance to configure provider credentials, models and gateway keys."
        actions={[
          {
            type: "link",
            label: "Self-hosting guide",
            href: GATEWAY_SELF_HOSTING_DOCS_URL,
          },
        ]}
      />
    </div>
  );
}

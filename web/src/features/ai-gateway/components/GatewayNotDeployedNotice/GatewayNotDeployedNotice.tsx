import { Server } from "@langfuse/icons";

import Header from "@/src/components/layouts/header";
import { GatewaySetupEmptyState } from "@/src/features/ai-gateway/components/GatewaySetupEmptyState/GatewaySetupEmptyState";

const SELF_HOSTING_DOCS_URL = "https://langfuse.com/self-hosting";

export function GatewayNotDeployedNotice() {
  return (
    <div className="flex flex-col gap-4">
      <Header title="Gateway setup" />
      <GatewaySetupEmptyState
        icon={Server}
        title="The AI Gateway isn't deployed"
        description="On self-hosted Langfuse, the AI Gateway runs as a separate service. Deploy it next to your Langfuse instance to configure providers, models and gateway keys."
        actions={[
          {
            type: "link",
            label: "Self-hosting docs",
            href: SELF_HOSTING_DOCS_URL,
          },
        ]}
      />
    </div>
  );
}

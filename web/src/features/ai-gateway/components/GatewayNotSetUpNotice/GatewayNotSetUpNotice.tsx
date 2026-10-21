import { Lock } from "@langfuse/icons";

import Header from "@/src/components/layouts/header";
import { GatewaySetupEmptyState } from "@/src/features/ai-gateway/components/GatewaySetupEmptyState/GatewaySetupEmptyState";

export type GatewayNotSetUpNoticeProps = {
  title: string;
};

export function GatewayNotSetUpNotice({ title }: GatewayNotSetUpNoticeProps) {
  return (
    <div className="flex flex-col gap-4">
      <Header title={title} />
      <GatewaySetupEmptyState
        icon={Lock}
        title="The AI Gateway isn't set up yet"
        description="Ask your organization admin to set up the AI Gateway."
      />
    </div>
  );
}

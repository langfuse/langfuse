import { useState } from "react";

import Header from "@/src/components/layouts/header";
import { GatewayCredentialsOverview } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewayCredentialsOverview/GatewayCredentialsOverview";
import { GatewaySetupGuide } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/GatewaySetupGuide";
import { GATEWAY_SETUP } from "@/src/features/ai-gateway/components/GatewaySetupPage/constants/gatewaySetup";
import { isGatewayConfigComplete } from "@/src/features/ai-gateway/components/GatewaySetupPage/fns/isGatewayConfigComplete";
import type {
  GatewayConfig,
  GatewayProject,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

export type GatewaySetupContentProps = {
  organizationId: string;
  connectionId: string | undefined;
  config: GatewayConfig | null;
  projects: GatewayProject[];
};

/**
 * Mount once the config has loaded: whether the guide shows is decided on the
 * first render and kept for the visit, so finishing step 1 does not swap the
 * guide for the overview mid-setup.
 */
export function GatewaySetupContent({
  organizationId,
  connectionId,
  config,
  projects,
}: GatewaySetupContentProps) {
  const [isGuideOpen, setIsGuideOpen] = useState(
    () => !isGatewayConfigComplete(config),
  );

  function handleGuideFinish() {
    setIsGuideOpen(false);
  }

  if (!isGuideOpen || connectionId !== undefined) {
    return (
      <GatewayCredentialsOverview
        organizationId={organizationId}
        connectionId={connectionId}
        config={config}
        projects={projects}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Header title={GATEWAY_SETUP.title} />
        <p className="text-muted-foreground text-sm">
          {GATEWAY_SETUP.description}
        </p>
      </div>
      <GatewaySetupGuide
        organizationId={organizationId}
        config={config}
        projects={projects}
        onFinish={handleGuideFinish}
      />
    </div>
  );
}

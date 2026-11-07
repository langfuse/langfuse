import { type ReactNode } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useGatewayConfig } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewayConfig";
import type { GatewayConfig } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

/** Loads the gateway config and renders the children once it is there. */
export function GatewayConfigLoader({
  organizationId,
  children,
}: {
  organizationId: string;
  children: (config: GatewayConfig | null) => ReactNode;
}) {
  const gatewayConfig = useGatewayConfig(organizationId);

  if (gatewayConfig.status === "pending") {
    return (
      <div className="flex flex-col gap-6" data-testid="gateway-setup-loading">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (gatewayConfig.status === "error") {
    return (
      <div className="flex flex-col items-start gap-4">
        <Alert variant="destructive">
          <Alert.Title>Gateway setup could not be loaded</Alert.Title>
          <Alert.Description>
            Retry the request to continue setting up the gateway.
          </Alert.Description>
        </Alert>
        <Button
          text="Retry"
          variant="secondary"
          onClick={gatewayConfig.retry}
        />
      </div>
    );
  }

  return children(gatewayConfig.config);
}

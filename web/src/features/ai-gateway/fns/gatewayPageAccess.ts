import { env } from "@/src/env.mjs";
import { canReadGatewayModels } from "@/src/features/ai-gateway/fns/canReadGatewayModels";

/** Which AI Gateway pages a member sees in an organization. */
export function gatewayPageAccess({
  organizationId,
  isAiGatewayEnabled,
  aiGatewayDeployed,
  canManageGateway,
  canReadGateway,
  canInvokeGateway,
}: {
  organizationId: string | undefined;
  isAiGatewayEnabled: boolean;
  aiGatewayDeployed: boolean | undefined;
  canManageGateway: boolean;
  canReadGateway: boolean;
  canInvokeGateway: boolean;
}) {
  return {
    /** Self-hosted without a gateway: managers get a pointer to the docs. */
    showNotDeployedNotice: aiGatewayDeployed === false && canManageGateway,
    showManagement: isAiGatewayEnabled && canManageGateway,
    /** Members manage their own gateway keys; managers see every key. */
    showApiKeys: isAiGatewayEnabled && canInvokeGateway,
    showModels:
      isAiGatewayEnabled &&
      organizationId !== undefined &&
      canReadGatewayModels({
        organizationId,
        demoOrganizationId: env.NEXT_PUBLIC_DEMO_ORG_ID,
        canReadGateway,
        canManageGateway,
      }),
  };
}

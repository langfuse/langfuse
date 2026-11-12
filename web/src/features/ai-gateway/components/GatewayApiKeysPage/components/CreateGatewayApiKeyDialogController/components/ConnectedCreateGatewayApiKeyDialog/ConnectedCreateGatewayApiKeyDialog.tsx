import type { ComponentProps } from "react";

import { CreateGatewayApiKeyDialog } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/CreateGatewayApiKeyDialog";
import { useGatewayEnabledModels } from "@/src/features/ai-gateway/hooks/useGatewayEnabledModels";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";

type ConnectedCreateGatewayApiKeyDialogProps = Omit<
  ComponentProps<typeof CreateGatewayApiKeyDialog>,
  "enabledModels"
> & {
  organizationId: string;
};

/** Loads the enabled models for the preview only while the dialog is open, and only for members who may see them. */
export function ConnectedCreateGatewayApiKeyDialog({
  organizationId,
  ...props
}: ConnectedCreateGatewayApiKeyDialogProps) {
  const { showModels } = useGatewaySettingsAccess(organizationId);
  const enabledModels = useGatewayEnabledModels(organizationId, {
    enabled: showModels,
  });

  return (
    <CreateGatewayApiKeyDialog
      {...props}
      enabledModels={showModels ? enabledModels : undefined}
    />
  );
}

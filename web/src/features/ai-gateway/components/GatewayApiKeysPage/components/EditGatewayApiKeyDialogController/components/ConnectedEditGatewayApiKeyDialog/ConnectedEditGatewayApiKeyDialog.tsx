import type { ComponentProps } from "react";

import { EditGatewayApiKeyDialog } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/EditGatewayApiKeyDialogController/components/EditGatewayApiKeyDialog/EditGatewayApiKeyDialog";
import { useGatewayEnabledModels } from "@/src/features/ai-gateway/hooks/useGatewayEnabledModels";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";

type ConnectedEditGatewayApiKeyDialogProps = Omit<
  ComponentProps<typeof EditGatewayApiKeyDialog>,
  "enabledModels"
> & {
  organizationId: string;
  /** The dialog controller keeps closed content mounted, so queries also wait for this. */
  isOpen: boolean;
};

/** Loads the enabled models for the preview only while the dialog is open, and only for members who may see them. */
export function ConnectedEditGatewayApiKeyDialog({
  organizationId,
  isOpen,
  ...props
}: ConnectedEditGatewayApiKeyDialogProps) {
  const { showModels } = useGatewaySettingsAccess(organizationId);
  const enabledModels = useGatewayEnabledModels(organizationId, {
    enabled: showModels && isOpen,
  });

  return (
    <EditGatewayApiKeyDialog
      {...props}
      enabledModels={showModels ? enabledModels : undefined}
    />
  );
}

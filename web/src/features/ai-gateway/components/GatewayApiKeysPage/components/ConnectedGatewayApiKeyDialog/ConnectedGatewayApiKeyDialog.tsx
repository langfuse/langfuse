import type { ComponentProps } from "react";

import { GatewayApiKeyDialog } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/GatewayApiKeyDialog";
import { useGatewayEnabledModels } from "@/src/features/ai-gateway/hooks/useGatewayEnabledModels";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";

type ConnectedGatewayApiKeyDialogProps = Omit<
  ComponentProps<typeof GatewayApiKeyDialog>,
  "enabledModels"
> & {
  organizationId: string;
  /** The dialog controller keeps closed content mounted, so queries also wait for this. */
  isOpen: boolean;
};

/** Loads the enabled models for the preview only while the dialog is open, and only for members who may see them. */
export function ConnectedGatewayApiKeyDialog({
  organizationId,
  isOpen,
  ...props
}: ConnectedGatewayApiKeyDialogProps) {
  const { showModels } = useGatewaySettingsAccess(organizationId);
  const enabledModels = useGatewayEnabledModels(organizationId, {
    enabled: showModels && isOpen,
  });

  return (
    <GatewayApiKeyDialog
      {...props}
      enabledModels={showModels ? enabledModels : undefined}
    />
  );
}

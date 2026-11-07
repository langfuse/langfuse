import { useState } from "react";

import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";

/**
 * Whether Overview shows the setup guide. Decided once the setup status loads
 * and kept for the visit, so saving step 1 does not swap the guide for
 * analytics mid-setup.
 */
export function useGatewayOverviewSetupVisit(
  organizationId: string | undefined,
) {
  const access = useGatewaySettingsAccess(organizationId);
  const [visit, setVisit] = useState<{
    organizationId: string;
    isSetupOpen: boolean;
  } | null>(null);

  const canDecide =
    organizationId !== undefined &&
    access.showManagement &&
    !access.showNotDeployedNotice &&
    !access.isSetupStatusPending;
  if (canDecide && visit?.organizationId !== organizationId) {
    setVisit({
      organizationId,
      isSetupOpen: access.isIngestionConfigured === false,
    });
  }

  const isSetupOpen =
    visit?.organizationId === organizationId && visit?.isSetupOpen === true;
  function closeSetup() {
    if (organizationId) setVisit({ organizationId, isSetupOpen: false });
  }

  return { isSetupOpen, closeSetup };
}

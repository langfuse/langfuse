import { useState } from "react";

import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";

/**
 * Whether Overview shows the setup guide. Decided once the setup status loads
 * and kept until the guide is finished, so saving step 1 does not swap the
 * guide for analytics mid-setup. Overview and the other gateway pages are
 * separate routes, so the open guide is also remembered in session storage.
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
    const isSetupOpen =
      access.isIngestionConfigured === false || readSetupOpen(organizationId);
    if (isSetupOpen) writeSetupOpen(organizationId, true);
    setVisit({ organizationId, isSetupOpen });
  }

  const isSetupOpen =
    visit?.organizationId === organizationId && visit?.isSetupOpen === true;
  function closeSetup() {
    if (!organizationId) return;
    writeSetupOpen(organizationId, false);
    setVisit({ organizationId, isSetupOpen: false });
  }

  return { isSetupOpen, closeSetup };
}

const storageKey = (organizationId: string) =>
  `langfuse:ai-gateway-setup-open:v1:${organizationId}`;

function readSetupOpen(organizationId: string): boolean {
  try {
    return window.sessionStorage.getItem(storageKey(organizationId)) === "1";
  } catch {
    return false;
  }
}

function writeSetupOpen(organizationId: string, isOpen: boolean) {
  try {
    if (isOpen) window.sessionStorage.setItem(storageKey(organizationId), "1");
    else window.sessionStorage.removeItem(storageKey(organizationId));
  } catch {
    // Storage can be unavailable, e.g. in private browsing; the guide then closes on navigation.
  }
}

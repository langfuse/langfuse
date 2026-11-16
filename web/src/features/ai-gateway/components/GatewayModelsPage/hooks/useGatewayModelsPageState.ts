import { useRouter } from "next/router";

import {
  GATEWAY_MODELS_TABS,
  type GatewayModelsTab,
} from "@/src/features/ai-gateway/constants/gatewayModelsTabs";

/** The Models page tab and provider filter, read from the URL. */
export function useGatewayModelsPageState(): {
  activeTab: GatewayModelsTab;
  connectionId: string | undefined;
} {
  const router = useRouter();
  const { tab, connectionId } = router.query;

  return {
    activeTab:
      tab === GATEWAY_MODELS_TABS.models
        ? GATEWAY_MODELS_TABS.models
        : GATEWAY_MODELS_TABS.providers,
    connectionId: typeof connectionId === "string" ? connectionId : undefined,
  };
}

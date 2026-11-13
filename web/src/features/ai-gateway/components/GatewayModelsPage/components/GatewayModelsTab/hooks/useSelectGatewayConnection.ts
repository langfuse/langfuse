import { useRouter } from "next/router";

import { buildGatewayModelsUrl } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayModelsUrl";

export function useSelectGatewayConnection(organizationId: string) {
  const router = useRouter();
  return (connectionId: string) =>
    router.replace(buildGatewayModelsUrl(organizationId, connectionId));
}

import { api } from "@/src/utils/api";

export function useGatewayConfig(organizationId: string) {
  const query = api.aiGateway.getConfig.useQuery({ orgId: organizationId });

  function retry() {
    query.refetch();
  }

  // A failed background refetch keeps the cached config, so the page stays mounted.
  if (query.data)
    return { status: "success" as const, config: query.data.config };
  if (query.isError) return { status: "error" as const, retry };
  return { status: "pending" as const };
}

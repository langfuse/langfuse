import { api } from "@/src/utils/api";

export function useGatewayConfig(organizationId: string) {
  const query = api.aiGateway.getConfig.useQuery({ orgId: organizationId });

  function retry() {
    query.refetch();
  }

  if (query.isPending) return { status: "pending" as const };
  if (query.isError) return { status: "error" as const, retry };
  return { status: "success" as const, config: query.data.config };
}

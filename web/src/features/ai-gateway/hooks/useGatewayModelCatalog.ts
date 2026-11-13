import { api } from "@/src/utils/api";

/** Each provider credential's discovered models, or its failure. */
export function useGatewayModelCatalog(
  organizationId: string,
  { enabled }: { enabled: boolean },
) {
  const query = api.aiGateway.refreshModels.useQuery(
    { orgId: organizationId },
    { enabled },
  );

  return {
    results: query.data,
    isPending: query.isPending,
    refetch: () => query.refetch(),
  };
}

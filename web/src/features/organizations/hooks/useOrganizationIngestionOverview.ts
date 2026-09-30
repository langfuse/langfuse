import { api } from "@/src/utils/api";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags";

export function useOrganizationIngestionOverview(organizationId: string) {
  const enabled = useInternalFeaturesEnabled();
  return api.organizationIngestion.overview.useQuery(
    { orgId: organizationId },
    { enabled: enabled && Boolean(organizationId) },
  );
}

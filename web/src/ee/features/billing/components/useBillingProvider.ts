import { api } from "@/src/utils/api";

/**
 * The billing provider checkout uses for the organization, resolved on the
 * server without calling either billing API.
 */
export function useBillingProvider({
  orgId,
  enabled,
}: {
  orgId: string | undefined;
  enabled: boolean;
}) {
  return api.cloudBilling.getBillingProvider.useQuery(
    { orgId: orgId ?? "" },
    { enabled: Boolean(orgId) && enabled },
  );
}

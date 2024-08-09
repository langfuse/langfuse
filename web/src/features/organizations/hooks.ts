import { api } from "@/src/utils/api";
import { useRouter } from "next/router";

/**
 * Hook to get the organization of the current page.
 */
export const useQueryOrganization = () => {
  const router = useRouter();
  const organizationId = router.query.organizationId;
  return useOrganization(
    typeof organizationId === "string" ? organizationId : null,
  );
};

export const useOrganization = (organizationId: string | null) => {
  const res = api.organizations.byId.useQuery(
    {
      orgId: organizationId as string,
    },
    {
      enabled: Boolean(organizationId),
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  );

  return res.data ?? null;
};

import { useSession } from "next-auth/react";
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
  const session = useSession();
  if (organizationId === null) return null;

  const organization = session.data?.user?.organizations.find(
    (org) => org.id === organizationId,
  );

  return organization ?? null;
};

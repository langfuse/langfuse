import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

export const useQueryOrganization = () => {
  const router = useRouter();
  const organizationId = router.query.organizationId;
  return useProject(typeof organizationId === "string" ? organizationId : null);
};

export const useProject = (organizationId: string | null) => {
  const session = useSession();

  const organizations = session.data?.user?.organizations || [];

  if (!organizationId || organizations.length === 0) return null;

  const organization = organizations.find((org) => org.id === organizationId);
  return organization ?? null;
};

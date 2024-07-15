import { api } from "@/src/utils/api";
import { useRouter } from "next/router";

export const useQueryOrganization = () => {
  const router = useRouter();
  const organizationId = router.query.organizationId;
  const projectId = router.query.projectId;
  return useOrganization({
    organizationId: typeof organizationId === "string" ? organizationId : null,
    projectId: typeof projectId === "string" ? projectId : null,
  });
};

export const useOrganization = (p: {
  organizationId: string | null;
  projectId: string | null;
}) => {
  const orgDataViaOrgId = api.organizations.byId.useQuery(
    {
      orgId: p.organizationId as string,
    },
    {
      enabled: Boolean(p.organizationId),
    },
  );
  const orgDataViaProjectId = api.organizations.byProjectId.useQuery(
    {
      projectId: p.projectId as string,
    },
    {
      enabled: Boolean(p.projectId),
    },
  );
  return orgDataViaOrgId.data ?? orgDataViaProjectId.data ?? null;
};

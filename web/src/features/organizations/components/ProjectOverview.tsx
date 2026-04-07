import { StringParam, useQueryParams } from "use-query-params";
import { type User } from "next-auth";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { env } from "@/src/env.mjs";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  OrganizationOverviewView,
  type OrganizationOverviewDisplayOrganization,
} from "@/src/features/organizations/components/OrganizationOverviewView";

const isDemoOrganization = (org: User["organizations"][number]) =>
  env.NEXT_PUBLIC_DEMO_ORG_ID === org.id &&
  org.projects.some(
    (project) => project.id === env.NEXT_PUBLIC_DEMO_PROJECT_ID,
  );

export const OrganizationProjectOverview = () => {
  const router = useRouter();
  const queryOrgId =
    typeof router.query.organizationId === "string"
      ? router.query.organizationId
      : undefined;
  const session = useSession();
  const canCreateOrg = Boolean(session.data?.user?.canCreateOrganizations);
  const organizations = session.data?.user?.organizations;
  const [{ search }, setQueryParams] = useQueryParams({ search: StringParam });

  if (organizations === undefined) {
    return "loading...";
  }

  const displayOrganizations: OrganizationOverviewDisplayOrganization[] =
    organizations.map((org) => ({
      ...org,
      canCreateProject: hasOrganizationAccess({
        session: session.data,
        organizationId: org.id,
        scope: "projects:create",
      }),
      canViewMembers: hasOrganizationAccess({
        session: session.data,
        organizationId: org.id,
        scope: "organizationMembers:read",
      }),
      isDemoOrg: isDemoOrganization(org),
    }));

  return (
    <OrganizationOverviewView
      organizations={displayOrganizations}
      canCreateOrg={canCreateOrg}
      search={search ?? ""}
      selectedOrganizationId={queryOrgId}
      onSearchChange={(value) =>
        setQueryParams({ search: value.length > 0 ? value : undefined })
      }
    />
  );
};

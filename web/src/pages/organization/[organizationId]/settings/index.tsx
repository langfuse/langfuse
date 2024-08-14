import { PagedSettingsContainer } from "@/src/components/PagedSettingsContainer";
import Header from "@/src/components/layouts/header";
import { MembershipInvitesPage } from "@/src/features/rbac/components/MembershipInvitesPage";
import { MembersTable } from "@/src/features/rbac/components/MembersTable";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { env } from "@/src/env.mjs";
import RenameOrganization from "@/src/features/organizations/components/RenameOrganization";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { OrganizationUsageChart } from "@/src/features/usage-metering/OrganizationUsageChart";
import { useRouter } from "next/router";
import { SettingsDangerZone } from "@/src/components/SettingsDangerZone";
import { DeleteOrganizationButton } from "@/src/features/organizations/components/DeleteOrganizationButton";

const OrgSettingsPage = () => {
  const organization = useQueryOrganization();
  const router = useRouter();
  const { page } = router.query;

  if (!organization) return null;

  return (
    <div className="lg:container">
      <Header title="Organization Settings" />
      <PagedSettingsContainer
        activeSlug={page as string | undefined}
        pages={[
          {
            title: "General",
            slug: "index",
            content: (
              <div className="flex flex-col gap-10">
                <RenameOrganization />
                <div>
                  <Header title="Debug Information" level="h3" />
                  <JSONView
                    title="Metadata"
                    json={{ name: organization.name, id: organization.id }}
                  />
                </div>
                <SettingsDangerZone
                  items={[
                    {
                      title: "Delete this organization",
                      description:
                        "Once you delete an organization, there is no going back. Please be certain.",
                      button: <DeleteOrganizationButton />,
                    },
                  ]}
                />
              </div>
            ),
          },
          {
            title: "Members",
            slug: "members",
            content: (
              <div className="flex flex-col gap-10">
                <div>
                  <Header title="Organization Members" level="h3" />
                  <MembersTable orgId={organization.id} />
                </div>
                <div>
                  <MembershipInvitesPage orgId={organization.id} />
                </div>
              </div>
            ),
          },
          {
            title: "Billing",
            slug: "billing",
            content: <OrganizationUsageChart />,
            show: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined,
          },
          {
            title: "Projects",
            slug: "projects",
            href: `/organization/${organization.id}`,
          },
        ]}
      />
    </div>
  );
};

export default OrgSettingsPage;

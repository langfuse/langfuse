import { PagedSettingsContainer } from "@/src/components/PagedSettingsContainer";
import Header from "@/src/components/layouts/header";
import MembersTable from "@/src/components/table/use-cases/members";
import InvitesTable from "@/src/components/table/use-cases/membershipInvites";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { env } from "@/src/env.mjs";
import RenameOrganization from "@/src/features/organizations/components/RenameOrganization";
import { useQueryOrganization } from "@/src/features/organizations/utils/useOrganization";
import { OrganizationUsageChart } from "@/src/features/usage-metering/OrganizationUsageChart";

const OrgSettingsPage = () => {
  const organization = useQueryOrganization();
  if (!organization) return null;

  return (
    <div className="md:container">
      <Header title="Organization Settings" />
      <PagedSettingsContainer
        pages={[
          {
            title: "General",
            content: (
              <div className="flex flex-col gap-10">
                <RenameOrganization />
                <div>
                  <Header title="Debug Information" level="h3" />
                  <JSONView
                    json={{ name: organization.name, id: organization.id }}
                  />
                </div>
              </div>
            ),
          },
          {
            title: "Members",
            content: (
              <div className="flex flex-col gap-10">
                <div>
                  <Header title="Organization Members" level="h3" />
                  <MembersTable orgId={organization.id} />
                </div>
                <div>
                  <Header title="Membership Invites" level="h3" />
                  <InvitesTable orgId={organization.id} />
                </div>
              </div>
            ),
          },
          {
            title: "Billing",
            content: <OrganizationUsageChart />,
            show: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined,
          },
        ]}
      />
    </div>
  );
};

export default OrgSettingsPage;

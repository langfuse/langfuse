import { PagedSettingsContainer } from "@/src/components/PagedSettingsContainer";
import Header from "@/src/components/layouts/header";
import { MembershipInvitesPage } from "@/src/features/rbac/components/MembershipInvitesPage";
import { MembersTable } from "@/src/features/rbac/components/MembersTable";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import RenameOrganization from "@/src/features/organizations/components/RenameOrganization";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { useRouter } from "next/router";
import { SettingsDangerZone } from "@/src/components/SettingsDangerZone";
import { DeleteOrganizationButton } from "@/src/features/organizations/components/DeleteOrganizationButton";
import { BillingSettings } from "@/src/ee/features/billing/components/BillingSettings";
import { useHasEntitlement, usePlan } from "@/src/features/entitlements/hooks";
import ContainerPage from "@/src/components/layouts/container-page";
import { SSOSettings } from "@/src/ee/features/sso-settings/components/SSOSettings";
import { isCloudPlan } from "@langfuse/shared";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { ApiKeyList } from "@/src/features/public-api/components/ApiKeyList";

type OrganizationSettingsPage = {
  title: string;
  slug: string;
  show?: boolean | (() => boolean);
  cmdKKeywords?: string[];
} & ({ content: React.ReactNode } | { href: string });

export function useOrganizationSettingsPages(): OrganizationSettingsPage[] {
  const { organization } = useQueryProjectOrOrganization();
  const showBillingSettings = useHasEntitlement("cloud-billing");
  const showOrgApiKeySettings = useHasEntitlement("admin-api");
  const plan = usePlan();
  const isLangfuseCloud = isCloudPlan(plan) ?? false;

  if (!organization) return [];

  return getOrganizationSettingsPages({
    organization,
    showBillingSettings,
    showOrgApiKeySettings,
    isLangfuseCloud,
  });
}

export const getOrganizationSettingsPages = ({
  organization,
  showBillingSettings,
  showOrgApiKeySettings,
  isLangfuseCloud,
}: {
  organization: { id: string; name: string; metadata: Record<string, unknown> };
  showBillingSettings: boolean;
  showOrgApiKeySettings: boolean;
  isLangfuseCloud: boolean;
}): OrganizationSettingsPage[] => [
  {
    title: "General",
    slug: "index",
    cmdKKeywords: ["name", "id", "delete"],
    content: (
      <div className="flex flex-col gap-6">
        <RenameOrganization />
        <div>
          <Header title="Debug Information" />
          <JSONView
            title="Metadata"
            json={{
              name: organization.name,
              id: organization.id,
              ...organization.metadata,
            }}
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
    title: "API Keys",
    slug: "api-keys",
    content: (
      <div className="flex flex-col gap-6">
        <ApiKeyList entityId={organization.id} scope="organization" />
      </div>
    ),
    show: showOrgApiKeySettings,
  },
  {
    title: "Members",
    slug: "members",
    cmdKKeywords: ["invite", "user", "rbac"],
    content: (
      <div className="flex flex-col gap-6">
        <div>
          <Header title="Organization Members" />
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
    cmdKKeywords: ["payment", "subscription", "plan", "invoice"],
    content: <BillingSettings />,
    show: showBillingSettings,
  },
  {
    title: "SSO",
    slug: "sso",
    cmdKKeywords: ["sso", "login", "auth", "okta", "saml", "azure"],
    content: <SSOSettings />,
    show: isLangfuseCloud,
  },
  {
    title: "Projects",
    slug: "projects",
    href: `/organization/${organization.id}`,
  },
];

const OrgSettingsPage = () => {
  const organization = useQueryOrganization();
  const router = useRouter();
  const { page } = router.query;
  const pages = useOrganizationSettingsPages();

  if (!organization) return null;

  return (
    <ContainerPage
      headerProps={{
        title: "Organization Settings",
      }}
    >
      <PagedSettingsContainer
        activeSlug={page as string | undefined}
        pages={pages}
      />
    </ContainerPage>
  );
};

export default OrgSettingsPage;

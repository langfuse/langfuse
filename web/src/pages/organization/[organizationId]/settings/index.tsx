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
import { useTranslation } from "react-i18next";

type OrganizationSettingsPage = {
  title: string;
  slug: string;
  show?: boolean | (() => boolean);
  cmdKKeywords?: string[];
} & ({ content: React.ReactNode } | { href: string });

export function useOrganizationSettingsPages(): OrganizationSettingsPage[] {
  const { t } = useTranslation();
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
    t,
  });
}

export const getOrganizationSettingsPages = ({
  organization,
  showBillingSettings,
  showOrgApiKeySettings,
  isLangfuseCloud,
  t,
}: {
  organization: { id: string; name: string; metadata: Record<string, unknown> };
  showBillingSettings: boolean;
  showOrgApiKeySettings: boolean;
  isLangfuseCloud: boolean;
  t: (key: string) => string;
}): OrganizationSettingsPage[] => [
  {
    title: t("organization.settings.general"),
    slug: "index",
    cmdKKeywords: ["name", "id", "delete"],
    content: (
      <div className="flex flex-col gap-6">
        <RenameOrganization />
        <div>
          <Header title={t("organization.settings.debugInformation")} />
          <JSONView
            title={t("organization.settings.metadata")}
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
              title: t("organization.settings.deleteOrganization"),
              description: t(
                "organization.settings.deleteOrganizationDescription",
              ),
              button: <DeleteOrganizationButton />,
            },
          ]}
        />
      </div>
    ),
  },
  {
    title: t("organization.settings.apiKeys"),
    slug: "api-keys",
    content: (
      <div className="flex flex-col gap-6">
        <ApiKeyList entityId={organization.id} scope="organization" />
      </div>
    ),
    show: showOrgApiKeySettings,
  },
  {
    title: t("organization.settings.members"),
    slug: "members",
    cmdKKeywords: ["invite", "user", "rbac"],
    content: (
      <div className="flex flex-col gap-6">
        <div>
          <Header title={t("organization.settings.organizationMembers")} />
          <MembersTable orgId={organization.id} />
        </div>
        <div>
          <MembershipInvitesPage orgId={organization.id} />
        </div>
      </div>
    ),
  },
  {
    title: t("organization.settings.billing"),
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
    title: t("organization.settings.projects"),
    slug: "projects",
    href: `/organization/${organization.id}`,
  },
];

const OrgSettingsPage = () => {
  const { t } = useTranslation();
  const organization = useQueryOrganization();
  const router = useRouter();
  const { page } = router.query;
  const pages = useOrganizationSettingsPages();

  if (!organization) return null;

  return (
    <ContainerPage
      headerProps={{
        title: t("organization.settings.title"),
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

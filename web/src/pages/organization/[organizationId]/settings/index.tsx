import { PagedSettingsContainer } from "@/src/components/PagedSettingsContainer";
import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import { MembershipInvitesPage } from "@/src/features/rbac/components/MembershipInvitesPage";
import { MembersTable } from "@/src/features/rbac/components/MembersTable";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import RenameOrganization from "@/src/features/organizations/components/RenameOrganization";
import { DeleteOrganizationDialogController } from "@/src/features/organizations/components/DeleteOrganizationDialogController";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { useRouter } from "next/router";
import { SettingsDangerZone } from "@/src/components/SettingsDangerZone";
import { BillingSettings } from "@/src/ee/features/billing/components/BillingSettings";
import { useHasEntitlement, usePlan } from "@/src/features/entitlements/hooks";
import ContainerPage from "@/src/components/layouts/container-page";
import { SSOSettings } from "@/src/ee/features/sso-settings/components/SSOSettings";
import { isCloudPlan } from "@langfuse/shared";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { ApiKeyList } from "@/src/features/public-api/components/ApiKeyList";
import AIFeatureSwitch from "@/src/features/organizations/components/AIFeatureSwitch";
import { useIsCloudBillingAvailable } from "@/src/ee/features/billing/utils/isCloudBilling";
import { env } from "@/src/env.mjs";
import { OrgAuditLogsSettingsPage } from "@/src/ee/features/audit-log-viewer/OrgAuditLogsSettingsPage";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useV4UpgradeUiFlag } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { OrganizationFeaturePreviewsSettings } from "@/src/features/feature-flags/components/OrganizationFeaturePreviewsSettings";
import { useTranslations } from "next-intl";

type OrganizationSettingsPage = {
  title: string;
  slug: string;
  show?: boolean | (() => boolean);
  cmdKKeywords?: string[];
} & ({ content: React.ReactNode } | { href: string });

const defaultOrganizationSettingsLabels = {
  general: "General",
  featurePreviews: "Feature Previews",
  apiKeys: "API Keys",
  members: "Members",
  auditLogs: "Audit Logs",
  billing: "Billing",
  sso: "SSO",
  projects: "Projects",
  v4Migration: "v4 Migration",
  debugInformation: "Debug Information",
  metadata: "Metadata",
  organizationMembers: "Organization Members",
  dangerZone: "Danger Zone",
  deleteTitle: "Delete this organization",
  deleteDescription:
    "Once you delete an organization, there is no going back. Please be certain.",
  deleteButton: "Delete Organization",
};

export function useOrganizationSettingsPages(): OrganizationSettingsPage[] {
  const t = useTranslations("workspace.organizationSettings");
  const { organization } = useQueryProjectOrOrganization();
  const showBillingSettings = useHasEntitlement("cloud-billing");
  const hasAdminApiEntitlement = useHasEntitlement("admin-api");
  const hasOrgApiKeyAccess = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organization:CRUD_apiKeys",
  });
  const showOrgApiKeySettings = hasAdminApiEntitlement && hasOrgApiKeyAccess;
  const showAuditLogs = useHasEntitlement("audit-logs");
  const canUpdateOrganization = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organization:update",
  });
  const plan = usePlan();
  const isLangfuseCloud = isCloudPlan(plan) ?? false;
  const isCloudBillingAvailable = useIsCloudBillingAvailable();
  const showV4Migration = useV4UpgradeUiFlag();

  if (!organization) return [];

  return getOrganizationSettingsPages({
    organization,
    showBillingSettings: showBillingSettings && isCloudBillingAvailable,
    showOrgApiKeySettings,
    showAuditLogs,
    isLangfuseCloud,
    showV4Migration,
    showFeaturePreviews:
      canUpdateOrganization && organization.id !== env.NEXT_PUBLIC_DEMO_ORG_ID,
    labels: {
      general: t("general"),
      featurePreviews: t("featurePreviews"),
      apiKeys: t("apiKeys"),
      members: t("members"),
      auditLogs: t("auditLogs"),
      billing: t("billing"),
      sso: t("sso"),
      projects: t("projects"),
      v4Migration: t("v4Migration"),
      debugInformation: t("debugInformation"),
      metadata: t("metadata"),
      organizationMembers: t("organizationMembers"),
      dangerZone: t("dangerZone"),
      deleteTitle: t("deleteTitle"),
      deleteDescription: t("deleteDescription"),
      deleteButton: t("deleteButton"),
    },
  });
}

export const getOrganizationSettingsPages = ({
  organization,
  showBillingSettings,
  showOrgApiKeySettings,
  showAuditLogs,
  isLangfuseCloud,
  showV4Migration,
  showFeaturePreviews,
  labels = defaultOrganizationSettingsLabels,
}: {
  organization: { id: string; name: string; metadata: Record<string, unknown> };
  showBillingSettings: boolean;
  showOrgApiKeySettings: boolean;
  showAuditLogs: boolean;
  isLangfuseCloud: boolean;
  showV4Migration: boolean;
  showFeaturePreviews: boolean;
  labels?: typeof defaultOrganizationSettingsLabels;
}): OrganizationSettingsPage[] => [
  {
    title: labels.general,
    slug: "index",
    cmdKKeywords: ["name", "id", "delete"],
    content: (
      <div className="flex flex-col gap-6">
        <RenameOrganization />
        <div>
          <Header title={labels.debugInformation} />
          <JSONView
            title={labels.metadata}
            json={{
              name: organization.name,
              id: organization.id,
              ...organization.metadata,
              ...(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION && {
                cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
              }),
            }}
          />
        </div>
        <AIFeatureSwitch />
        <SettingsDangerZone
          title={labels.dangerZone}
          items={[
            {
              title: labels.deleteTitle,
              description: labels.deleteDescription,
              button: (
                <DeleteOrganizationDialogController>
                  {({ disabled, openDialog }) => (
                    <Button
                      variant="destructive-secondary"
                      disabled={disabled !== undefined}
                      onClick={openDialog}
                    >
                      {labels.deleteButton}
                    </Button>
                  )}
                </DeleteOrganizationDialogController>
              ),
            },
          ]}
        />
      </div>
    ),
  },
  {
    title: labels.featurePreviews,
    slug: "feature-previews",
    cmdKKeywords: ["feature", "preview", "flags", "beta"],
    content: <OrganizationFeaturePreviewsSettings orgId={organization.id} />,
    show: showFeaturePreviews,
  },
  {
    title: labels.apiKeys,
    slug: "api-keys",
    content: (
      <div className="flex flex-col gap-6">
        <ApiKeyList entityId={organization.id} scope="organization" />
      </div>
    ),
    show: showOrgApiKeySettings,
  },
  {
    title: labels.members,
    slug: "members",
    cmdKKeywords: ["invite", "user", "rbac"],
    content: (
      <div className="flex flex-col gap-6">
        <div>
          <Header title={labels.organizationMembers} />
          <MembersTable orgId={organization.id} />
        </div>
        <div>
          <MembershipInvitesPage orgId={organization.id} />
        </div>
      </div>
    ),
  },
  {
    title: labels.auditLogs,
    slug: "audit-logs",
    cmdKKeywords: ["audit", "logs", "history", "changes"],
    content: <OrgAuditLogsSettingsPage orgId={organization.id} />,
    show: showAuditLogs,
  },
  {
    title: labels.billing,
    slug: "billing",
    cmdKKeywords: ["payment", "subscription", "plan", "invoice"],
    content: <BillingSettings />,
    show: showBillingSettings,
  },
  {
    title: labels.sso,
    slug: "sso",
    cmdKKeywords: [
      "sso",
      "login",
      "auth",
      "okta",
      "saml",
      "azure",
      "domain",
      "dns",
      "txt",
      "verify",
    ],
    content: <SSOSettings orgId={organization.id} />,
    show: isLangfuseCloud,
  },
  {
    title: labels.projects,
    slug: "projects",
    href: `/organization/${organization.id}`,
  },
  {
    title: labels.v4Migration,
    slug: "v4-migration",
    href: "/v4-migration",
    show: showV4Migration,
  },
];

const OrgSettingsPage = () => {
  const t = useTranslations("workspace.organizationSettings");
  const organization = useQueryOrganization();
  const router = useRouter();
  const { page } = router.query;
  const pages = useOrganizationSettingsPages();

  if (!organization) return null;

  return (
    <ContainerPage
      headerProps={{
        title: t("title"),
      }}
    >
      <PagedSettingsContainer
        activeSlug={page as string | undefined}
        pages={pages}
        selectPlaceholder={t("selectPlaceholder")}
      />
    </ContainerPage>
  );
};

export default OrgSettingsPage;

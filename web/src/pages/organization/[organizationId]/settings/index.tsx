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
import {
  GatewayApiKeysPage,
  GatewayConfigurationPage,
  GatewayModelsPage,
  GatewayProvidersPage,
} from "@/src/features/llm-gateway";

type OrganizationSettingsPage = {
  title: string;
  slug: string;
  section?: string;
  show?: boolean | (() => boolean);
  cmdKKeywords?: string[];
} & ({ content: React.ReactNode } | { href: string });

export function useOrganizationSettingsPages(): OrganizationSettingsPage[] {
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
    showLlmGateway: canUpdateOrganization,
    showFeaturePreviews:
      canUpdateOrganization && organization.id !== env.NEXT_PUBLIC_DEMO_ORG_ID,
  });
}

export const getOrganizationSettingsPages = ({
  organization,
  showBillingSettings,
  showOrgApiKeySettings,
  showAuditLogs,
  isLangfuseCloud,
  showV4Migration,
  showLlmGateway,
  showFeaturePreviews,
}: {
  organization: {
    id: string;
    name: string;
    metadata: Record<string, unknown>;
    projects: Array<{
      id: string;
      name: string;
      deletedAt?: Date | string | null;
    }>;
  };
  showBillingSettings: boolean;
  showOrgApiKeySettings: boolean;
  showAuditLogs: boolean;
  isLangfuseCloud: boolean;
  showV4Migration: boolean;
  showLlmGateway: boolean;
  showFeaturePreviews: boolean;
}): OrganizationSettingsPage[] => [
  {
    title: "General",
    slug: "index",
    section: "Organization",
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
              ...(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION && {
                cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
              }),
            }}
          />
        </div>
        <AIFeatureSwitch />
        <SettingsDangerZone
          items={[
            {
              title: "Delete this organization",
              description:
                "Once you delete an organization, there is no going back. Please be certain.",
              button: (
                <DeleteOrganizationDialogController>
                  {({ disabled, openDialog }) => (
                    <Button
                      variant="destructive-secondary"
                      disabled={disabled !== undefined}
                      onClick={openDialog}
                    >
                      Delete Organization
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
    title: "Feature Previews",
    slug: "feature-previews",
    section: "Organization",
    cmdKKeywords: ["feature", "preview", "flags", "beta"],
    content: <OrganizationFeaturePreviewsSettings orgId={organization.id} />,
    show: showFeaturePreviews,
  },
  {
    title: "API Keys",
    slug: "api-keys",
    section: "Organization",
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
    section: "Organization",
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
    title: "Audit Logs",
    slug: "audit-logs",
    section: "Organization",
    cmdKKeywords: ["audit", "logs", "history", "changes"],
    content: <OrgAuditLogsSettingsPage orgId={organization.id} />,
    show: showAuditLogs,
  },
  {
    title: "Billing",
    slug: "billing",
    section: "Organization",
    cmdKKeywords: ["payment", "subscription", "plan", "invoice"],
    content: <BillingSettings />,
    show: showBillingSettings,
  },
  {
    title: "SSO",
    slug: "sso",
    section: "Organization",
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
    title: "Projects",
    slug: "projects",
    section: "Organization",
    href: `/organization/${organization.id}`,
  },
  {
    title: "v4 Migration",
    slug: "v4-migration",
    section: "Organization",
    href: "/v4-migration",
    show: showV4Migration,
  },
  {
    title: "Configuration",
    slug: "llm-gateway",
    section: "LLM Gateway",
    cmdKKeywords: ["gateway", "llm", "configuration", "instrumentation"],
    content: (
      <GatewayConfigurationPage
        organizationId={organization.id}
        projects={organization.projects}
      />
    ),
    show: showLlmGateway,
  },
  {
    title: "Provider credentials",
    slug: "llm-gateway-providers",
    section: "LLM Gateway",
    cmdKKeywords: [
      "gateway",
      "providers",
      "credentials",
      "openai",
      "anthropic",
      "openrouter",
    ],
    content: <GatewayProvidersPage organizationId={organization.id} />,
    show: showLlmGateway,
  },
  {
    title: "Models",
    slug: "llm-gateway-models",
    section: "LLM Gateway",
    cmdKKeywords: ["gateway", "models", "discovery", "sync"],
    content: <GatewayModelsPage organizationId={organization.id} />,
    show: showLlmGateway,
  },
  {
    title: "Gateway API keys",
    slug: "llm-gateway-api-keys",
    section: "LLM Gateway",
    cmdKKeywords: ["gateway", "api", "keys", "metadata", "credentials"],
    content: <GatewayApiKeysPage organizationId={organization.id} />,
    show: showLlmGateway,
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

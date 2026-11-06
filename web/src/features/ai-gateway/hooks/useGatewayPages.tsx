import { type ComponentProps } from "react";

import { type PagedSettingsContainer } from "@/src/components/PagedSettingsContainer";
import { GatewayAnalyticsPage } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/GatewayAnalyticsPage";
import { GatewayApiKeysPage } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/GatewayApiKeysPage";
import { GatewayModelsPage } from "@/src/features/ai-gateway/components/GatewayModelsPage/GatewayModelsPage";
import { GatewayNotDeployedNotice } from "@/src/features/ai-gateway/components/GatewayNotDeployedNotice/GatewayNotDeployedNotice";
import { GatewaySetupPage } from "@/src/features/ai-gateway/components/GatewaySetupPage/GatewaySetupPage";
import {
  GATEWAY_PAGE_SLUGS,
  type GatewayPageSlug,
} from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { useGatewayKeyReminder } from "@/src/features/ai-gateway/hooks/useGatewayKeyReminder";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

const GATEWAY_SETUP_REQUIRED_REASON =
  "Set up an ingestion project in Setup first.";

type GatewayPageEntry = ComponentProps<
  typeof PagedSettingsContainer
>["pages"][number] & { slug: GatewayPageSlug; cmdKKeywords: string[] };

/** The AI Gateway sub-pages of the current organization, in navigation order. */
export function useGatewayPages(): GatewayPageEntry[] {
  const { organization } = useQueryProjectOrOrganization();
  const access = useGatewaySettingsAccess(organization?.id);
  const keyReminder = useGatewayKeyReminder(organization?.id);
  const canReadSettings = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organizationSettings:read",
  });

  if (!organization) return [];

  /** Only managers get disabled entries; others see a notice on the page. */
  const disabledReason =
    access.showManagement && access.isIngestionConfigured === false
      ? GATEWAY_SETUP_REQUIRED_REASON
      : undefined;
  /** Gateway-only members; members with settings access keep today's pages. */
  const showOwnUsageAnalytics =
    access.showApiKeys && !access.showManagement && !canReadSettings;

  return [
    {
      title: "Setup",
      slug: GATEWAY_PAGE_SLUGS.setup,
      cmdKKeywords: [
        "gateway",
        "llm",
        "setup",
        "configuration",
        "ingestion",
        "providers",
        "credentials",
        "openai",
        "anthropic",
      ],
      content: access.showNotDeployedNotice ? (
        <GatewayNotDeployedNotice />
      ) : (
        <GatewaySetupPage
          organizationId={organization.id}
          projects={organization.projects}
        />
      ),
      show: access.showManagement || access.showNotDeployedNotice,
    },
    {
      title: "Models",
      slug: GATEWAY_PAGE_SLUGS.models,
      cmdKKeywords: ["gateway", "models", "discovery", "sync"],
      content: <GatewayModelsPage organizationId={organization.id} />,
      show: access.showModels,
      disabledReason,
    },
    {
      title: "Gateway keys",
      slug: GATEWAY_PAGE_SLUGS.apiKeys,
      cmdKKeywords: ["gateway", "api", "keys", "metadata", "credentials"],
      content: <GatewayApiKeysPage organizationId={organization.id} />,
      show: access.showApiKeys,
      indicator: keyReminder,
      disabledReason,
    },
    {
      title: "Analytics",
      slug: GATEWAY_PAGE_SLUGS.analytics,
      cmdKKeywords: ["gateway", "analytics", "cost", "usage", "consumption"],
      content: <GatewayAnalyticsPage organizationId={organization.id} />,
      show: access.showManagement || showOwnUsageAnalytics,
      disabledReason,
    },
  ];
}

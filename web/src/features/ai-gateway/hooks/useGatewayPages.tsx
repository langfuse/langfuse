import { type ReactNode } from "react";

import { GatewayAnalyticsPage } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/GatewayAnalyticsPage";
import { GatewayApiKeysPage } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/GatewayApiKeysPage";
import { GatewayModelsPage } from "@/src/features/ai-gateway/components/GatewayModelsPage/GatewayModelsPage";
import { GatewayNotDeployedNotice } from "@/src/features/ai-gateway/components/GatewayNotDeployedNotice/GatewayNotDeployedNotice";
import { GatewaySetupPage } from "@/src/features/ai-gateway/components/GatewaySetupPage/GatewaySetupPage";
import {
  GATEWAY_PAGE_SLUGS,
  type GatewayPageSlug,
} from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { gatewayPageVisibility } from "@/src/features/ai-gateway/fns/gatewayPageAccess";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

const GATEWAY_SETUP_REQUIRED_REASON =
  "Set up an ingestion project in Setup first.";

type GatewayPageEntry = {
  title: string;
  slug: GatewayPageSlug;
  cmdKKeywords: string[];
  content: ReactNode;
  show: boolean;
  /** Set when the page needs the gateway set up first. */
  disabledReason?: string;
};

/** The AI Gateway sub-pages of the current organization, in navigation order. */
export function useGatewayPages(): GatewayPageEntry[] {
  const { organization } = useQueryProjectOrOrganization();
  const access = useGatewaySettingsAccess(organization?.id);
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
  const visible = gatewayPageVisibility(access, canReadSettings);

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
      show: visible[GATEWAY_PAGE_SLUGS.setup],
    },
    {
      title: "Models",
      slug: GATEWAY_PAGE_SLUGS.models,
      cmdKKeywords: ["gateway", "models", "discovery", "sync"],
      content: <GatewayModelsPage organizationId={organization.id} />,
      show: visible[GATEWAY_PAGE_SLUGS.models],
      disabledReason,
    },
    {
      title: "Gateway keys",
      slug: GATEWAY_PAGE_SLUGS.apiKeys,
      cmdKKeywords: ["gateway", "api", "keys", "metadata", "credentials"],
      content: <GatewayApiKeysPage organizationId={organization.id} />,
      show: visible[GATEWAY_PAGE_SLUGS.apiKeys],
      disabledReason,
    },
    {
      title: "Analytics",
      slug: GATEWAY_PAGE_SLUGS.analytics,
      cmdKKeywords: ["gateway", "analytics", "cost", "usage", "consumption"],
      content: <GatewayAnalyticsPage organizationId={organization.id} />,
      show: visible[GATEWAY_PAGE_SLUGS.analytics],
      disabledReason,
    },
  ];
}

import { type ReactNode } from "react";

import { GatewayApiKeysPage } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/GatewayApiKeysPage";
import { GatewayModelsPage } from "@/src/features/ai-gateway/components/GatewayModelsPage/GatewayModelsPage";
import { GatewayProvidersHeaderActions } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayProvidersHeaderActions/GatewayProvidersHeaderActions";
import { GatewayNotDeployedNotice } from "@/src/features/ai-gateway/components/GatewayNotDeployedNotice/GatewayNotDeployedNotice";
import { GatewayOverviewPage } from "@/src/features/ai-gateway/components/GatewayOverviewPage/GatewayOverviewPage";
import { buildGatewayModelsTabs } from "@/src/features/ai-gateway/components/GatewayModelsPage/fns/buildGatewayModelsTabs";
import { useGatewayModelsPageState } from "@/src/features/ai-gateway/components/GatewayModelsPage/hooks/useGatewayModelsPageState";
import { GATEWAY_MODELS_TABS } from "@/src/features/ai-gateway/constants/gatewayModelsTabs";
import type { PageTabsProps } from "@/src/components/layouts/PageTabs";
import {
  GATEWAY_PAGE_SLUGS,
  type GatewayPageSlug,
} from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { gatewayPageVisibility } from "@/src/features/ai-gateway/fns/gatewayPageAccess";
import { useGatewayOverviewSetupVisit } from "@/src/features/ai-gateway/hooks/useGatewayOverviewSetupVisit";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { useGatewaySetupRequiredReason } from "@/src/features/ai-gateway/hooks/useGatewaySetupRequiredReason";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

type GatewayPageEntry = {
  title: string;
  slug: GatewayPageSlug;
  cmdKKeywords: string[];
  content: ReactNode;
  /** Scroll the whole page instead of letting the content manage its own scrolling. */
  scrollable?: boolean;
  tabsProps?: PageTabsProps;
  /** Hides the page title, e.g. while a banner takes its place. */
  hideTitle?: boolean;
  /** Rendered on the right of the page title row. */
  actions?: ReactNode;
  show: boolean;
  /** Set when the page needs the gateway set up first. */
  disabledReason?: string;
};

/** The AI Gateway sub-pages of the current organization, in navigation order. */
export function useGatewayPages(): GatewayPageEntry[] {
  const { organization } = useQueryProjectOrOrganization();
  const access = useGatewaySettingsAccess(organization?.id);
  const disabledReason = useGatewaySetupRequiredReason(organization?.id);
  const canReadSettings = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organizationSettings:read",
  });
  const { activeTab: modelsTab } = useGatewayModelsPageState();
  const overviewSetup = useGatewayOverviewSetupVisit(organization?.id);

  if (!organization) return [];

  const visible = gatewayPageVisibility(access, canReadSettings);
  return [
    {
      title: "Overview",
      slug: GATEWAY_PAGE_SLUGS.overview,
      cmdKKeywords: [
        "gateway",
        "overview",
        "setup",
        "analytics",
        "cost",
        "usage",
        "consumption",
      ],
      content: (
        <GatewayOverviewPage
          organizationId={organization.id}
          projects={organization.projects}
          isSetupOpen={overviewSetup.isSetupOpen}
          onSetupFinish={overviewSetup.closeSetup}
        />
      ),
      scrollable: true,
      hideTitle: overviewSetup.isSetupOpen,
      show: visible[GATEWAY_PAGE_SLUGS.overview],
    },
    {
      title: "Models",
      slug: GATEWAY_PAGE_SLUGS.models,
      cmdKKeywords: [
        "gateway",
        "models",
        "providers",
        "credentials",
        "ingestion",
        "openai",
        "anthropic",
      ],
      content: access.showNotDeployedNotice ? (
        <GatewayNotDeployedNotice />
      ) : (
        <GatewayModelsPage organizationId={organization.id} />
      ),
      actions:
        access.canManageGateway &&
        !access.showNotDeployedNotice &&
        modelsTab === GATEWAY_MODELS_TABS.providers ? (
          <GatewayProvidersHeaderActions
            organizationId={organization.id}
            projects={organization.projects}
          />
        ) : undefined,
      scrollable: modelsTab === GATEWAY_MODELS_TABS.providers,
      tabsProps: access.showNotDeployedNotice
        ? undefined
        : buildGatewayModelsTabs(organization.id, modelsTab),
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
  ];
}

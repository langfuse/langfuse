import { api } from "@/src/utils/api";
import { type ReactNode } from "react";

import { GatewayAnalyticsTitleFilters } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsTitleFilters/GatewayAnalyticsTitleFilters";
import { GATEWAY_ANALYTICS_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { GatewayApiKeysPage } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/GatewayApiKeysPage";
import { GatewayApiKeysHeaderActions } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeysHeaderActions/GatewayApiKeysHeaderActions";
import { GatewayModelsPage } from "@/src/features/ai-gateway/components/GatewayModelsPage/GatewayModelsPage";
import { GatewayProvidersHeaderActions } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayProvidersHeaderActions/GatewayProvidersHeaderActions";
import { GatewayNotDeployedNotice } from "@/src/features/ai-gateway/components/GatewayNotDeployedNotice/GatewayNotDeployedNotice";
import { GatewayIngestionHeaderAction } from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewayIngestionHeaderAction/GatewayIngestionHeaderAction";
import { GatewayOverviewPage } from "@/src/features/ai-gateway/components/GatewayOverviewPage/GatewayOverviewPage";
import { buildGatewayModelsTabs } from "@/src/features/ai-gateway/components/GatewayModelsPage/fns/buildGatewayModelsTabs";
import { useGatewayModelsPageState } from "@/src/features/ai-gateway/components/GatewayModelsPage/hooks/useGatewayModelsPageState";
import { GATEWAY_MODELS_TABS } from "@/src/features/ai-gateway/constants/gatewayModelsTabs";
import { gatewayConnectionsPageSize } from "@/src/features/ai-gateway/constants/gatewayConnectionsPageSize";
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
  /** Scrolls the content below the header instead of letting the content manage its own scrolling. */
  scrollable?: boolean;
  tabsProps?: PageTabsProps;
  /** Hides the page title, e.g. while a banner takes its place. */
  hideTitle?: boolean;
  /** Drops the page padding so the content can span the full width; it pads itself. */
  fullBleed?: boolean;
  /** Rendered next to the page title, e.g. filters. */
  actionsLeft?: ReactNode;
  /** Rendered on the right of the page title row. */
  actions?: ReactNode;
  help?: { description: string; href?: string };
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
  const canInviteMembers = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organizationMembers:CUD",
  });
  const { activeTab: modelsTab } = useGatewayModelsPageState();
  const overviewSetup = useGatewayOverviewSetupVisit(organization?.id);
  const memberLabelsQuery = api.aiGateway.getAnalyticsLabels.useQuery(
    { orgId: organization?.id ?? "" },
    {
      enabled:
        Boolean(organization) &&
        !access.canManageGateway &&
        access.showApiKeys &&
        access.isIngestionConfigured === true,
    },
  );
  const isModelsPageLoadable =
    Boolean(organization) && access.showModels && !access.showNotDeployedNotice;
  /** Managers also see connections in error, so they count as connections here too. */
  const managerConnectionsQuery =
    api.aiGateway.listConnections.useInfiniteQuery(
      { orgId: organization?.id ?? "", limit: gatewayConnectionsPageSize },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        enabled: isModelsPageLoadable && access.canManageGateway,
      },
    );
  const modelConnectionsQuery = api.aiGateway.listModelConnections.useQuery(
    { orgId: organization?.id ?? "" },
    { enabled: isModelsPageLoadable && !access.canManageGateway },
  );

  if (!organization) return [];

  const visible = gatewayPageVisibility(access, canReadSettings);
  /** The not-set-up notice carries its own title, so the page title row is dropped. */
  const showsNotSetUpNotice =
    !access.canManageGateway && access.isIngestionConfigured === false;
  /** The first-key placeholder carries its own create and instructions buttons. */
  const showsFirstKeyPlaceholder =
    !access.canManageGateway && memberLabelsQuery.data?.apiKeys.length === 0;
  /** Without a deployed gateway, Overview shows only the not-deployed notice and runs no gateway query. */
  const showsOverviewHeaderControls =
    !overviewSetup.isSetupOpen && !access.showNotDeployedNotice;
  /** Models only lists models of connections, so its tab waits for the first connection. */
  const hasNoConnections = access.canManageGateway
    ? managerConnectionsQuery.data?.pages[0]?.data.length === 0
    : modelConnectionsQuery.data?.length === 0;
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
        "ingestion",
      ],
      content: (
        <GatewayOverviewPage
          organizationId={organization.id}
          projects={organization.projects}
          isSetupOpen={overviewSetup.isSetupOpen}
          onSetupFinish={overviewSetup.closeSetup}
        />
      ),
      actionsLeft:
        showsOverviewHeaderControls && !showsNotSetUpNotice ? (
          <GatewayAnalyticsTitleFilters
            organizationId={organization.id}
            canManageGateway={access.canManageGateway}
          />
        ) : undefined,
      help: {
        description: access.canManageGateway
          ? "Cost and usage of requests made through the AI Gateway, read from its ingestion project."
          : "Cost and usage of your requests made through the AI Gateway.",
        href: GATEWAY_ANALYTICS_DOCS_URL,
      },
      actions:
        access.canManageGateway && showsOverviewHeaderControls ? (
          <GatewayIngestionHeaderAction
            organizationId={organization.id}
            projects={organization.projects}
          />
        ) : undefined,
      scrollable: true,
      hideTitle:
        overviewSetup.isSetupOpen ||
        showsNotSetUpNotice ||
        access.showNotDeployedNotice,
      fullBleed: overviewSetup.isSetupOpen,
      show: visible[GATEWAY_PAGE_SLUGS.overview],
    },
    {
      title: "Connections & Models",
      slug: GATEWAY_PAGE_SLUGS.models,
      cmdKKeywords: [
        "gateway",
        "models",
        "providers",
        "connections",
        "credentials",
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
          <GatewayProvidersHeaderActions organizationId={organization.id} />
        ) : undefined,
      scrollable: modelsTab === GATEWAY_MODELS_TABS.providers,
      tabsProps:
        access.showNotDeployedNotice || showsNotSetUpNotice || hasNoConnections
          ? undefined
          : buildGatewayModelsTabs(organization.id, modelsTab),
      hideTitle: showsNotSetUpNotice || access.showNotDeployedNotice,
      show: visible[GATEWAY_PAGE_SLUGS.models],
      disabledReason,
    },
    {
      title: "Gateway keys",
      slug: GATEWAY_PAGE_SLUGS.apiKeys,
      cmdKKeywords: ["gateway", "api", "keys", "metadata", "credentials"],
      content: <GatewayApiKeysPage organizationId={organization.id} />,
      actions:
        !access.isSetupStatusPending &&
        (access.canManageGateway || access.isIngestionConfigured !== false) &&
        !showsFirstKeyPlaceholder ? (
          <GatewayApiKeysHeaderActions
            organizationId={organization.id}
            canInvite={access.canManageGateway && canInviteMembers}
          />
        ) : undefined,
      hideTitle: showsNotSetUpNotice,
      show: visible[GATEWAY_PAGE_SLUGS.apiKeys],
      disabledReason,
    },
  ];
}

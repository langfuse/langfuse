import { type ReactNode } from "react";

import { GatewayAnalyticsPage } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/GatewayAnalyticsPage";
import { GatewayNotDeployedNotice } from "@/src/features/ai-gateway/components/GatewayNotDeployedNotice/GatewayNotDeployedNotice";
import { GatewaySetupPage } from "@/src/features/ai-gateway/components/GatewaySetupPage/GatewaySetupPage";
import { GatewayApiKeysPage } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/GatewayApiKeysPage";
import { GatewayModelsPage } from "@/src/features/ai-gateway/components/GatewayModelsPage/GatewayModelsPage";
import { useAiGatewayPageVisibility } from "@/src/features/ai-gateway/hooks/useAiGatewayPageVisibility";
import { type AiGatewayPageSlug } from "@/src/features/ai-gateway/fns/gatewayUrls/aiGatewayPath";

type AiGatewayPage = {
  title: string;
  slug: AiGatewayPageSlug;
  content: ReactNode;
  show: boolean;
  disabledReason?: string;
  /** Setup, Models and Keys fill the viewport with their own tables. */
  fullHeight: boolean;
};

export function useAiGatewayPages(
  organization:
    | {
        id: string;
        projects: Array<{
          id: string;
          name: string;
          deletedAt?: Date | string | null;
        }>;
      }
    | undefined,
): AiGatewayPage[] {
  const visibility = useAiGatewayPageVisibility(organization?.id);

  if (!organization) return [];

  return [
    {
      title: "Setup",
      slug: "setup",
      content: visibility.showNotDeployedNotice ? (
        <GatewayNotDeployedNotice />
      ) : (
        <GatewaySetupPage
          organizationId={organization.id}
          projects={organization.projects}
        />
      ),
      show: visibility.show.setup,
      fullHeight: true,
    },
    {
      title: "Models",
      slug: "models",
      content: <GatewayModelsPage organizationId={organization.id} />,
      show: visibility.show.models,
      disabledReason: visibility.setupDisabledReason,
      fullHeight: true,
    },
    {
      title: "Gateway keys",
      slug: "keys",
      content: <GatewayApiKeysPage organizationId={organization.id} />,
      show: visibility.show.keys,
      disabledReason: visibility.setupDisabledReason,
      fullHeight: true,
    },
    {
      title: "Analytics",
      slug: "analytics",
      content: <GatewayAnalyticsPage organizationId={organization.id} />,
      show: visibility.show.analytics,
      disabledReason: visibility.setupDisabledReason,
      fullHeight: false,
    },
  ];
}

import {
  AI_GATEWAY_KEY_ID_METADATA_KEY,
  AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY,
  encodeFiltersGeneric,
  type FilterState,
} from "@langfuse/shared";

import type { GatewaySpendTab } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/constants/gatewaySpendTabs";

const metadataKeysByTab = {
  users: AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY,
  apiKeys: AI_GATEWAY_KEY_ID_METADATA_KEY,
} as const satisfies Record<GatewaySpendTab, string>;

/** Link to the ingestion project's traces view filtered to one gateway user or API key. */
export function buildGatewayBudgetTracesHref({
  projectId,
  tab,
  subjectId,
}: {
  projectId: string;
  tab: GatewaySpendTab;
  subjectId: string;
}) {
  const filter: FilterState = [
    {
      column: "metadata",
      type: "stringObject",
      key: metadataKeysByTab[tab],
      operator: "=",
      value: subjectId,
    },
  ];

  return `/project/${encodeURIComponent(projectId)}/traces?filter=${encodeURIComponent(encodeFiltersGeneric(filter))}`;
}

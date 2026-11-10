import preview from "@/.storybook/preview";
import { GATEWAY_FIRST_REQUEST_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { GatewayAnalyticsNoKeysEmptyState } from "./GatewayAnalyticsNoKeysEmptyState";

const meta = preview.meta({
  component: GatewayAnalyticsNoKeysEmptyState,
  parameters: { layout: "padded" },
});

export const Default = meta.story({
  args: {
    gatewayKeysHref: "/organization/org-1/ai-gateway/api-keys",
    docsHref: GATEWAY_FIRST_REQUEST_DOCS_URL,
    providers: [
      { provider: "ANTHROPIC", isConnected: true },
      { provider: "OPENAI", isConnected: true },
      { provider: "BEDROCK", isConnected: false },
    ],
  },
});

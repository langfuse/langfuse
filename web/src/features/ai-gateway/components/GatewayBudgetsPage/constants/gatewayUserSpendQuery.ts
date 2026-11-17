import { GATEWAY_COST_BY_USER_WIDGET } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/constants/gatewayAnalyticsWidgets";
import type { GatewayAnalyticsWidget } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";

/** The largest row limit the query layer accepts; the table searches and pages these rows in the browser. */
const USER_SPEND_ROW_LIMIT = 1000;

export const GATEWAY_USER_SPEND_QUERY: GatewayAnalyticsWidget = {
  ...GATEWAY_COST_BY_USER_WIDGET,
  id: "user-spend",
  chartConfig: { type: "HORIZONTAL_BAR", row_limit: USER_SPEND_ROW_LIMIT },
};

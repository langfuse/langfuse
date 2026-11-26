import type { GatewayAnalyticsGranularity } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";

export const GATEWAY_TIME_SERIES_INTERVALS = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
] as const satisfies readonly {
  value: GatewayAnalyticsGranularity;
  label: string;
}[];

export type GatewayTimeSeriesInterval =
  (typeof GATEWAY_TIME_SERIES_INTERVALS)[number]["value"];

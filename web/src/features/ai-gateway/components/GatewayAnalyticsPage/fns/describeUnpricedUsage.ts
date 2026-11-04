import type { GatewayUnpricedUsage } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/fns/summarizeUnpricedUsage";
import { compactNumberFormatter, numberFormatter } from "@/src/utils/numbers";

/** "12 requests (3.4K tokens)" */
export function describeUnpricedUsage(usage: GatewayUnpricedUsage) {
  const requests = `${numberFormatter(usage.requests, 0)} ${usage.requests === 1 ? "request" : "requests"}`;
  return `${requests} (${compactNumberFormatter(usage.tokens)} tokens)`;
}

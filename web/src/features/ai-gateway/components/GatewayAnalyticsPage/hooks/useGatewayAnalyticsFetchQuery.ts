import { useMemo } from "react";

import type { WidgetContentProps } from "@/src/features/widgets/components/InlineWidget";
import { api } from "@/src/utils/api";

export type GatewayAnalyticsFetchQuery = NonNullable<
  WidgetContentProps["fetchQuery"]
>;

/** Runs widget queries as the gateway's analytics, which the server scopes to the caller's access. */
export function useGatewayAnalyticsFetchQuery(
  organizationId: string,
): GatewayAnalyticsFetchQuery {
  const utils = api.useUtils();
  return useMemo(
    () => ({
      key: `aiGateway.executeAnalyticsQuery:${organizationId}`,
      fetch: (query) =>
        utils.aiGateway.executeAnalyticsQuery.fetch(
          { orgId: organizationId, query },
          { trpc: { context: { skipBatch: true } } },
        ),
    }),
    [organizationId, utils],
  );
}

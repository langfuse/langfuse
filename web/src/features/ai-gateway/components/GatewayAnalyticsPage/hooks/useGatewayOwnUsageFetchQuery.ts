import { useMemo } from "react";

import type { WidgetQuerySource } from "@/src/features/widgets/components/InlineWidget";
import { api } from "@/src/utils/api";

/** Widget source for the caller's own gateway usage; the server scopes it to them. */
export function useGatewayOwnUsageFetchQuery(
  organizationId: string,
): WidgetQuerySource {
  const utils = api.useUtils();
  return useMemo(
    () => ({
      fetchQuery: {
        key: `aiGateway.executeAnalyticsQuery:${organizationId}`,
        fetch: (query) =>
          utils.aiGateway.executeAnalyticsQuery.fetch(
            { orgId: organizationId, query },
            { trpc: { context: { skipBatch: true } } },
          ),
      },
    }),
    [organizationId, utils],
  );
}

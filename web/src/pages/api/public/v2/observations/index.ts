import { getObservationsV2FromEventsTableForPublicApi } from "@langfuse/shared/src/server";

import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";

import {
  GetObservationsV2Query,
  GetObservationsV2Response,
  encodeCursor,
} from "@/src/features/public-api/types/observations";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Observations V2",
    querySchema: GetObservationsV2Query,
    responseSchema: GetObservationsV2Response,
    fn: async ({ query, auth }) => {
      // Since topLevelOnly is not a column filter, we need to handle it explicitly
      const parentObservationId = Boolean(query.topLevelOnly)
        ? ""
        : (query.parentObservationId ?? undefined);

      const filterProps = {
        projectId: auth.scope.projectId,
        page: 0, // v2 doesn't use page-based pagination
        limit: query.limit,
        traceId: query.traceId ?? undefined,
        userId: query.userId ?? undefined,
        level: query.level ?? undefined,
        name: query.name ?? undefined,
        type: query.type ?? undefined,
        environment: query.environment ?? undefined,
        parentObservationId,
        fromStartTime: query.fromStartTime ?? undefined,
        toStartTime: query.toStartTime ?? undefined,
        version: query.version ?? undefined,
        advancedFilters: query.filter,
        parseIoAsJson: query.parseIoAsJson ?? false,
        withCursor: query.withCursor ?? undefined,
        fields: query.fields ?? undefined,
      };

      // Fetch observations from events table with field groups applied at query time
      const items = await getObservationsV2FromEventsTableForPublicApi({
        ...filterProps,
        fields: filterProps.fields ?? [], // V2 requires fields array
      });

      // Determine if there are more results (we fetched limit+1)
      const hasMore = items.length > query.limit;
      const dataToReturn = hasMore ? items.slice(0, query.limit) : items;

      // Convert empty parent_observation_id to null for consistency with v1
      const transformedItems = dataToReturn.map((item) => {
        if (item.parentObservationId === "") {
          return { ...item, parentObservationId: null };
        }
        return item;
      });

      // Generate cursor if there are more results
      const lastItemIdx = dataToReturn.length - 1;
      const meta =
        hasMore && dataToReturn.length > 0
          ? {
              cursor: encodeCursor({
                lastStartTimeTo: dataToReturn[lastItemIdx].startTime,
                lastTraceId: dataToReturn[lastItemIdx].traceId ?? "",
                lastId: dataToReturn[lastItemIdx].id,
              }),
            }
          : {};

      return {
        data: transformedItems,
        meta,
      };
    },
  }),
});

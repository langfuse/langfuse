import { getObservationsFromEventsTableForPublicApi } from "@langfuse/shared/src/server";

import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";

import {
  GetObservationsV2Query,
  GetObservationsV2Response,
  transformDbToApiObservation,
  filterObservationByFields,
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
      };

      // Fetch observations from events table
      const items =
        await getObservationsFromEventsTableForPublicApi(filterProps);

      // Transform observations and apply field filtering
      const transformedItems = items.map((item) => {
        // Transform to API format
        let observation = transformDbToApiObservation(item);

        // Convert empty parent_observation_id to null for consistency with v1
        if (observation.parentObservationId === "") {
          observation = { ...observation, parentObservationId: null };
        }

        // Filter to only include requested fields
        return filterObservationByFields(observation, query.fields);
      });

      return {
        data: transformedItems,
        meta: {}, // TODO Empty meta for now, cursor pagination will be added later
      };
    },
  }),
});

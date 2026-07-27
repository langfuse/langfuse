import {
  PostEventsV1Body,
  PostEventsV1Response,
} from "@/src/features/public-api/types/events";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  createIngestionAttribution,
  eventTypes,
  logger,
  processEventBatch,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Event",
    bodySchema: PostEventsV1Body,
    responseSchema: PostEventsV1Response,
    // Writes an observation-create event that lands in the legacy observations
    // ClickHouse table; events_only deployments expect OTel ingestion.
    rejectInEventsOnlyMode: true,
    fn: async ({ body, auth, req, res }) => {
      const event = {
        id: v4(),
        type: eventTypes.OBSERVATION_CREATE,
        timestamp: new Date().toISOString(),
        body: {
          ...body,
          type: "EVENT",
        },
      };
      if (!event.body.id) {
        event.body.id = v4();
      }
      const result = await processEventBatch([event], auth, {
        attribution: createIngestionAttribution({
          headers: req.headers,
          authCheck: auth,
        }),
      });
      if (result.errors.length > 0) {
        const error = result.errors[0];
        res
          .status(error.status)
          .json({ message: error.error ?? error.message });
        return { id: "" }; // dummy return
      }
      if (result.successes.length !== 1) {
        logger.error("Failed to create event", { result });
        throw new Error("Failed to create event");
      }
      return { id: event.body.id };
    },
  }),
});

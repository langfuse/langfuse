import {
  PatchSpansV1Body,
  PatchSpansV1Response,
  PostSpansV1Body,
  PostSpansV1Response,
} from "@/src/features/public-api/types/spans";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { tokenCount } from "@/src/features/ingest/usage";
import {
  eventTypes,
  logger,
  processEventBatch,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Create Span (Legacy)",
    bodySchema: PostSpansV1Body,
    responseSchema: PostSpansV1Response,
    fn: async ({ body, auth, res }) => {
      const event = {
        id: v4(),
        type: eventTypes.OBSERVATION_CREATE,
        timestamp: new Date().toISOString(),
        body: {
          ...body,
          type: "SPAN",
        },
      };
      if (!event.body.id) {
        event.body.id = v4();
      }
      const result = await processEventBatch([event], auth, tokenCount);
      if (result.errors.length > 0) {
        const error = result.errors[0];
        res
          .status(error.status)
          .json({ message: error.error ?? error.message });
        return { id: "" }; // dummy return
      }
      if (result.successes.length !== 1) {
        logger.error("Failed to create span", { result });
        throw new Error("Failed to create span");
      }
      return { id: event.body.id };
    },
  }),
  PATCH: createAuthedAPIRoute({
    name: "Update Span (Legacy)",
    bodySchema: PatchSpansV1Body,
    responseSchema: PatchSpansV1Response,
    fn: async ({ body, auth, res }) => {
      const event = {
        id: v4(),
        type: eventTypes.OBSERVATION_UPDATE,
        timestamp: new Date().toISOString(),
        body: {
          ...body,
          id: body.spanId,
          type: "SPAN",
        },
      };
      const result = await processEventBatch([event], auth, tokenCount);
      if (result.errors.length > 0) {
        const error = result.errors[0];
        res
          .status(error.status)
          .json({ message: error.error ?? error.message });
        return { id: "" }; // dummy return
      }
      if (result.successes.length !== 1) {
        logger.error("Failed to update span", { result });
        throw new Error("Failed to update span");
      }
      return { id: event.body.id };
    },
  }),
});

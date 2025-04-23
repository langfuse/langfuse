import {
  PostGenerationsV1Body,
  PostGenerationsV1Response,
  PatchGenerationsV1Body,
  PatchGenerationsV1Response,
} from "@/src/features/public-api/types/generations";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  eventTypes,
  logger,
  processEventBatch,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Generation (Legacy)",
    bodySchema: PostGenerationsV1Body,
    responseSchema: PostGenerationsV1Response,
    rateLimitResource: "legacy-ingestion",
    fn: async ({ body, auth, res }) => {
      const { prompt, completion, ...rest } = body;
      const event = {
        id: v4(),
        type: eventTypes.OBSERVATION_CREATE,
        timestamp: new Date().toISOString(),
        body: {
          ...rest,
          type: "GENERATION",
          input: prompt,
          output: completion,
        },
      };
      if (!event.body.id) {
        event.body.id = v4();
      }
      const result = await processEventBatch([event], auth);
      if (result.errors.length > 0) {
        const error = result.errors[0];
        res
          .status(error.status)
          .json({ message: error.error ?? error.message });
        return { id: "" }; // dummy return
      }
      if (result.successes.length !== 1) {
        logger.error("Failed to create generation", { result });
        throw new Error("Failed to create generation");
      }
      return { id: event.body.id };
    },
  }),
  PATCH: createAuthedProjectAPIRoute({
    name: "Patch Generation (Legacy)",
    bodySchema: PatchGenerationsV1Body,
    responseSchema: PatchGenerationsV1Response,
    rateLimitResource: "legacy-ingestion",
    fn: async ({ body, auth, res }) => {
      const { generationId, prompt, completion, ...rest } = body;
      const event = {
        id: v4(),
        type: eventTypes.OBSERVATION_UPDATE,
        timestamp: new Date().toISOString(),
        body: {
          ...rest,
          id: generationId,
          type: "GENERATION",
          input: prompt,
          output: completion,
        },
      };
      const result = await processEventBatch([event], auth);
      if (result.errors.length > 0) {
        const error = result.errors[0];
        res
          .status(error.status)
          .json({ message: error.error ?? error.message });
        return { id: "" }; // dummy return
      }
      if (result.successes.length !== 1) {
        logger.error("Failed to update generation", { result });
        throw new Error("Failed to update generation");
      }
      return { id: event.body.id };
    },
  }),
});

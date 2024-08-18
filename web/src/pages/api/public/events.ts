import {
  PostEventsV1Body,
  PostEventsV1Response,
  transformEventToIngestionBatch,
} from "@/src/features/public-api/types/events";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { parseSingleTypedIngestionApiResponse } from "@/src/pages/api/public/ingestion";
import { handleBatch } from "@langfuse/shared/src/server";
import { tokenCount } from "@/src/features/ingest/usage";

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Create Event",
    bodySchema: PostEventsV1Body,
    responseSchema: PostEventsV1Response,
    fn: async ({ body, auth }) => {
      const ingestionBatch = transformEventToIngestionBatch(body);
      const result = await handleBatch(ingestionBatch, auth, tokenCount);
      const response = parseSingleTypedIngestionApiResponse(
        result.errors,
        result.results,
        PostEventsV1Response,
      );
      return response;
    },
  }),
});

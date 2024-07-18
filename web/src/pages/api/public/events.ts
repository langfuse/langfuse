import {
  PostEventsV1Body,
  PostEventsV1Response,
  transformEventToIngestionBatch,
} from "@/src/features/public-api/types/events";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import {
  handleBatch,
  parseSingleTypedIngestionApiResponse,
} from "@/src/pages/api/public/ingestion";

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Create Event",
    bodySchema: PostEventsV1Body,
    responseSchema: PostEventsV1Response,
    fn: async ({ body, auth, req }) => {
      const ingestionBatch = transformEventToIngestionBatch(body);
      const result = await handleBatch(ingestionBatch, {}, req, auth);
      const response = parseSingleTypedIngestionApiResponse(
        result.errors,
        result.results,
        PostEventsV1Response,
      );
      return response;
    },
  }),
});

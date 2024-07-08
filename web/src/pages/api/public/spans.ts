import {
  PatchSpansV1Body,
  PatchSpansV1Response,
  PostSpansV1Body,
  PostSpansV1Response,
  transformLegacySpanPatchToIngestionBatch,
  transformLegacySpanPostToIngestionBatch,
} from "@/src/features/public-api/types/spans";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import {
  handleBatch,
  parseSingleTypedIngestionApiResponse,
} from "@/src/pages/api/public/ingestion";

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Create Span (Legacy)",
    bodySchema: PostSpansV1Body,
    responseSchema: PostSpansV1Response,
    fn: async ({ body, auth, req }) => {
      const ingestionBatch = transformLegacySpanPostToIngestionBatch(body);
      const result = await handleBatch(ingestionBatch, {}, req, auth);
      const response = parseSingleTypedIngestionApiResponse(
        result.errors,
        result.results,
        PostSpansV1Response,
      );
      return response;
    },
  }),
  PATCH: createAuthedAPIRoute({
    name: "Update Span (Legacy)",
    bodySchema: PatchSpansV1Body,
    responseSchema: PatchSpansV1Response,
    fn: async ({ body, auth, req }) => {
      const ingestionBatch = transformLegacySpanPatchToIngestionBatch(body);
      const result = await handleBatch(ingestionBatch, {}, req, auth);
      const response = parseSingleTypedIngestionApiResponse(
        result.errors,
        result.results,
        PatchSpansV1Response,
      );
      return response;
    },
  }),
});

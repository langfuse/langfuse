import {
  PostGenerationsV1Body,
  PostGenerationsV1Response,
  PatchGenerationsV1Body,
  PatchGenerationsV1Response,
  transformGenerationPostToIngestionBatch,
  transformGenerationPatchToIngestionBatch,
} from "@/src/features/public-api/types/generations";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import {
  handleBatch,
  parseSingleTypedIngestionApiResponse,
} from "@/src/pages/api/public/ingestion";
import { transformDbToApiObservation } from "@/src/features/public-api/types/observations";

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Create Generation (Legacy)",
    bodySchema: PostGenerationsV1Body,
    responseSchema: PostGenerationsV1Response,
    fn: async ({ body, auth, req }) => {
      const ingestionBatch = transformGenerationPostToIngestionBatch(body);
      const result = await handleBatch(ingestionBatch, {}, req, auth);
      const response = parseSingleTypedIngestionApiResponse(
        result.errors,
        result.results,
      );
      const generation = transformDbToApiObservation(response);
      return generation;
    },
  }),
  PATCH: createAuthedAPIRoute({
    name: "Update Generation (Legacy)",
    bodySchema: PatchGenerationsV1Body,
    responseSchema: PatchGenerationsV1Response,
    fn: async ({ body, auth, req }) => {
      const ingestionBatch = transformGenerationPatchToIngestionBatch(body);
      const result = await handleBatch(ingestionBatch, {}, req, auth);
      const response = parseSingleTypedIngestionApiResponse(
        result.errors,
        result.results,
      );
      const generation = transformDbToApiObservation(response);
      return generation;
    },
  }),
});

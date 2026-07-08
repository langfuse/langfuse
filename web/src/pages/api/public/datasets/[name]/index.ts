import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetDatasetV1Query,
  GetDatasetV1Response,
} from "@/src/features/public-api/types/datasets";
import { getDatasetByNameForApi } from "@/src/features/datasets/server/publicDatasetService";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Dataset",
    querySchema: GetDatasetV1Query,
    responseSchema: GetDatasetV1Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) =>
      await getDatasetByNameForApi({
        name: query.name,
        projectId: auth.scope.projectId,
      }),
  }),
});

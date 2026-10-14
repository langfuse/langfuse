import { withMiddlewares } from "@/src/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/public-api/server/createAuthedProjectAPIRoute";
import {
  GetDatasetV1Query,
  GetDatasetV1Response,
} from "@/src/public-api/types/datasets";
import { getDatasetByNameForApi } from "@/src/datasets/server/publicDatasetService";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Dataset",
    action: "datasets:read",
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

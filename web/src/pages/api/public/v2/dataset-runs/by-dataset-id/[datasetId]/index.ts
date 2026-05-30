import {
  GetDatasetRunsV2ByIdQuery,
  GetDatasetRunsV2ByIdResponse,
} from "@/src/features/public-api/types/datasets";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { listDatasetRunsByDatasetIdForApi } from "@/src/features/datasets/server/publicDatasetService";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "get-dataset-runs-by-id",
    querySchema: GetDatasetRunsV2ByIdQuery,
    responseSchema: GetDatasetRunsV2ByIdResponse,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) =>
      await listDatasetRunsByDatasetIdForApi({
        projectId: auth.scope.projectId,
        datasetId: query.datasetId,
        page: query.page,
        limit: query.limit,
      }),
  }),
});

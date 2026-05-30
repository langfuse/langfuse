import {
  GetDatasetRunsV2ByIdQuery,
  GetDatasetRunsV2ByIdResponse,
  transformDbDatasetRunToAPIDatasetRun,
} from "@/src/features/public-api/types/datasets";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { listDatasetRunsByDatasetIdForApi } from "@/src/features/public-api/server/dataset-runs";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "get-dataset-runs-by-id",
    querySchema: GetDatasetRunsV2ByIdQuery,
    responseSchema: GetDatasetRunsV2ByIdResponse,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      const runs = await listDatasetRunsByDatasetIdForApi({
        projectId: auth.scope.projectId,
        datasetId: query.datasetId,
        page: query.page,
        limit: query.limit,
      });

      return {
        data: runs.runs.map((run) =>
          transformDbDatasetRunToAPIDatasetRun({
            ...run,
            datasetName: runs.datasetName,
          }),
        ),
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems: runs.totalItems,
          totalPages: Math.ceil(runs.totalItems / query.limit),
        },
      };
    },
  }),
});

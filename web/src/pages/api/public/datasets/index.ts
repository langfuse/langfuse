import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetDatasetsV1Query,
  GetDatasetsV1Response,
  PostDatasetsV1Body,
  PostDatasetsV1Response,
} from "@/src/features/public-api/types/datasets";
import {
  createDatasetForApi,
  listDatasetsByProjectForApi,
} from "@/src/features/datasets/server/publicDatasetService";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create or Update Dataset",
    bodySchema: PostDatasetsV1Body,
    responseSchema: PostDatasetsV1Response,
    rateLimitResource: "datasets",
    fn: async ({ body, auth }) => {
      const dataset = await createDatasetForApi({
        input: body,
        projectId: auth.scope.projectId,
        auditScope: auth.scope,
      });

      return {
        ...dataset,
        items: [],
        runs: [],
      };
    },
  }),
  GET: createAuthedProjectAPIRoute({
    name: "Get Datasets",
    querySchema: GetDatasetsV1Query,
    responseSchema: GetDatasetsV1Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) =>
      await listDatasetsByProjectForApi({
        projectId: auth.scope.projectId,
        page: query.page,
        limit: query.limit,
      }),
  }),
});

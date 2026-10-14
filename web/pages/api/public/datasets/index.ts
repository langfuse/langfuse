import { withMiddlewares } from "@/src/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/public-api/server/createAuthedProjectAPIRoute";
import {
  GetDatasetsV1Query,
  GetDatasetsV1Response,
  PostDatasetsV1Body,
  PostDatasetsV1Response,
} from "@/src/public-api/types/datasets";
import {
  createDatasetForApi,
  listDatasetsByProjectForApi,
} from "@/src/datasets/server/publicDatasetService";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create or Update Dataset",
    action: "datasets:CUD",
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
    action: "datasets:read",
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

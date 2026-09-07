import {
  GetDatasetsV2Query,
  GetDatasetsV2Response,
  PostDatasetsV2Body,
  PostDatasetsV2Response,
} from "@/src/features/public-api/types/datasets";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  createDatasetForApi,
  listDatasetsForApi,
} from "@/src/features/datasets/server/publicDatasetService";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Dataset",
    action: "datasets:CUD",
    bodySchema: PostDatasetsV2Body,
    responseSchema: PostDatasetsV2Response,
    rateLimitResource: "datasets",
    fn: async ({ body, auth }) => {
      const dataset = await createDatasetForApi({
        input: body,
        projectId: auth.scope.projectId,
        auditScope: auth.scope,
      });

      return dataset;
    },
  }),
  GET: createAuthedProjectAPIRoute({
    name: "Get Datasets",
    action: "datasets:read",
    querySchema: GetDatasetsV2Query,
    responseSchema: GetDatasetsV2Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      // Delegate to the shared `listDatasetsForApi` service function. The
      // service accepts the optional `name` (case-insensitive substring
      // filter) and pagination params; future time-window params will
      // also flow through here.
      return await listDatasetsForApi({
        projectId: auth.scope.projectId,
        name: query.name ?? undefined,
        page: query.page,
        limit: query.limit,
      });
    },
  }),
});

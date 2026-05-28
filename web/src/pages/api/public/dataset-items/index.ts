import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetDatasetItemsV1Query,
  GetDatasetItemsV1Response,
  PostDatasetItemsV1Body,
  PostDatasetItemsV1Response,
} from "@/src/features/public-api/types/datasets";
import {
  createDatasetItemForApi,
  listDatasetItemsForApi,
} from "@/src/features/datasets/server/publicDatasetService";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4.5mb",
    },
  },
};

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Dataset Item",
    bodySchema: PostDatasetItemsV1Body,
    responseSchema: PostDatasetItemsV1Response,
    rateLimitResource: "datasets",
    fn: async ({ body, auth }) =>
      await createDatasetItemForApi({
        input: body,
        auditScope: auth.scope,
      }),
  }),
  GET: createAuthedProjectAPIRoute({
    name: "Get Dataset Items",
    querySchema: GetDatasetItemsV1Query,
    responseSchema: GetDatasetItemsV1Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) =>
      await listDatasetItemsForApi({
        ...query,
        projectId: auth.scope.projectId,
      }),
  }),
});

import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetDatasetsV1Query,
  GetDatasetsV1Response,
  PostDatasetsV1Body,
  PostDatasetsV1Response,
  transformDbDatasetToAPIDataset,
} from "@/src/features/public-api/types/datasets";
import { upsertDataset } from "@/src/features/datasets/server/actions/createDataset";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { listDatasetsByProjectForApi } from "@/src/features/datasets/server/publicDatasetService";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create or Update Dataset",
    bodySchema: PostDatasetsV1Body,
    responseSchema: PostDatasetsV1Response,
    rateLimitResource: "datasets",
    fn: async ({ body, auth }) => {
      const { name, description, metadata, inputSchema, expectedOutputSchema } =
        body;

      const dataset = await upsertDataset({
        input: {
          name,
          description: description ?? undefined,
          metadata: metadata ?? undefined,
          inputSchema,
          expectedOutputSchema,
        },
        projectId: auth.scope.projectId,
      });

      await auditLog({
        action: "create",
        resourceType: "dataset",
        resourceId: dataset.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        after: dataset,
      });

      return {
        ...transformDbDatasetToAPIDataset(dataset),
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

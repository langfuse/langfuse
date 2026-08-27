import { prisma } from "@langfuse/shared/src/db";
import {
  GetDatasetV2Query,
  GetDatasetV2Response,
  PatchDatasetV2Body,
  PatchDatasetV2Query,
  PatchDatasetV2Response,
  transformDbDatasetToAPIDataset,
} from "@/src/features/public-api/types/datasets";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { unstablePublicEvalsErrorContract } from "@/src/features/public-api/server/unstable-public-api-error-contract";
import { updateDatasetForApi } from "@/src/features/datasets/server/publicDatasetService";
import { LangfuseNotFoundError } from "@langfuse/shared";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "get-dataset",
    querySchema: GetDatasetV2Query,
    responseSchema: GetDatasetV2Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      const { datasetName } = query;

      const dataset = await prisma.dataset.findFirst({
        where: {
          name: datasetName,
          projectId: auth.scope.projectId,
        },
      });

      if (!dataset) {
        throw new LangfuseNotFoundError("Dataset not found");
      }
      return transformDbDatasetToAPIDataset(dataset);
    },
  }),
  PATCH: createAuthedProjectAPIRoute({
    name: "Update Dataset",
    querySchema: PatchDatasetV2Query,
    bodySchema: PatchDatasetV2Body,
    responseSchema: PatchDatasetV2Response,
    rateLimitResource: "datasets",
    errorContract: unstablePublicEvalsErrorContract,
    fn: async ({ query, body, auth }) => {
      return updateDatasetForApi({
        datasetName: query.datasetName,
        body,
        projectId: auth.scope.projectId,
        auditScope: auth.scope,
      });
    },
  }),
});

import { prisma } from "@langfuse/shared/src/db";
import {
  GetDatasetV2Query,
  GetDatasetV2Response,
  transformDbDatasetToAPIDataset,
} from "@/src/public-api/types/datasets";
import { withMiddlewares } from "@/src/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/public-api/server/createAuthedProjectAPIRoute";
import { LangfuseNotFoundError } from "@langfuse/shared";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "get-dataset",
    action: "datasets:read",
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
});

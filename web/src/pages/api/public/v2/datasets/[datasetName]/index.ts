import { prisma } from "@langfuse/shared/src/db";
import {
  GetDatasetV2Query,
  GetDatasetV2Response,
} from "@/src/features/public-api/types/datasets";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
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
      return dataset;
    },
  }),
});

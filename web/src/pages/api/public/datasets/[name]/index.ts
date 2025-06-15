import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetDatasetV1Query,
  GetDatasetV1Response,
  transformDbDatasetItemToAPIDatasetItem,
} from "@/src/features/public-api/types/datasets";
import { LangfuseNotFoundError } from "@langfuse/shared";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Dataset",
    querySchema: GetDatasetV1Query,
    responseSchema: GetDatasetV1Response,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      const { name } = query;

      const dataset = await prisma.dataset.findFirst({
        where: {
          name: name,
          projectId: auth.scope.projectId,
        },
        include: {
          datasetItems: {
            where: {
              status: "ACTIVE",
            },
            orderBy: {
              createdAt: "desc",
            },
          },
          datasetRuns: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!dataset) {
        throw new LangfuseNotFoundError("Dataset not found");
      }

      const { datasetItems, datasetRuns, ...params } = dataset;

      return {
        ...params,
        items: datasetItems
          .map((item) => ({
            ...item,
            datasetName: dataset.name,
          }))
          .map(transformDbDatasetItemToAPIDatasetItem),
        runs: datasetRuns.map((run) => run.name),
      };
    },
  }),
});

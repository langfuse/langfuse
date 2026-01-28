import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetDatasetV1Query,
  GetDatasetV1Response,
  transformDbDatasetItemDomainToAPIDatasetItem,
  transformDbDatasetToAPIDataset,
} from "@/src/features/public-api/types/datasets";
import { LangfuseNotFoundError } from "@langfuse/shared";
import {
  createDatasetItemFilterState,
  getDatasetItems,
} from "@langfuse/shared/src/server";

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

      const datasetItems = await getDatasetItems({
        projectId: auth.scope.projectId,
        filterState: createDatasetItemFilterState({
          datasetIds: [dataset.id],
          status: "ACTIVE",
        }),
        includeDatasetName: true,
      });

      const { datasetRuns, ...params } = dataset;

      return {
        ...transformDbDatasetToAPIDataset(params),
        items: datasetItems.map(transformDbDatasetItemDomainToAPIDatasetItem),
        runs: datasetRuns.map((run) => run.name),
      };
    },
  }),
});

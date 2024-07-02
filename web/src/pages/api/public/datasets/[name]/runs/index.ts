import { prisma } from "@langfuse/shared/src/db";
import {
  GetDatasetRunsV1Query,
  GetDatasetRunsV1Response,
} from "@/src/features/public-api/types/datasets";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { LangfuseNotFoundError } from "@langfuse/shared";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "get-dataset-runs",
    querySchema: GetDatasetRunsV1Query,
    responseSchema: GetDatasetRunsV1Response,
    fn: async ({ query, auth }) => {
      const dataset = await prisma.dataset.findFirst({
        where: {
          name: query.name,
          projectId: auth.scope.projectId,
        },
        include: {
          datasetRuns: {
            take: query.limit,
            skip: (query.page - 1) * query.limit,
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      });

      if (!dataset) {
        throw new LangfuseNotFoundError("Dataset not found");
      }

      const totalItems = await prisma.datasetRuns.count({
        where: {
          datasetId: dataset.id,
        },
      });

      return {
        data: dataset.datasetRuns.map((run) => ({
          ...run,
          datasetName: dataset.name,
        })),
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems,
          totalPages: Math.ceil(totalItems / query.limit),
        },
      };
    },
  }),
});

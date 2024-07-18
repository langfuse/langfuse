import { prisma } from "@langfuse/shared/src/db";
import {
  GetDatasetRunV1Query,
  GetDatasetRunV1Response,
  transformDbDatasetRunItemToAPIDatasetRunItem,
  transformDbDatasetRunToAPIDatasetRun,
} from "@/src/features/public-api/types/datasets";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { ApiError, LangfuseNotFoundError } from "@langfuse/shared";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "get-dataset-run",
    querySchema: GetDatasetRunV1Query,
    responseSchema: GetDatasetRunV1Response,
    fn: async ({ query, auth }) => {
      const datasetRuns = await prisma.datasetRuns.findMany({
        where: {
          projectId: auth.scope.projectId,
          name: query.runName,
          dataset: {
            name: query.name,
            projectId: auth.scope.projectId,
          },
        },
        include: {
          datasetRunItems: true,
          dataset: {
            select: {
              name: true,
            },
          },
        },
      });

      if (datasetRuns.length > 1)
        throw new ApiError("Found more than one dataset run with this name");
      if (!datasetRuns[0])
        throw new LangfuseNotFoundError("Dataset run not found");

      const { dataset, datasetRunItems, ...run } = datasetRuns[0];

      return {
        ...transformDbDatasetRunToAPIDatasetRun({
          ...run,
          datasetName: dataset.name,
        }),
        datasetRunItems: datasetRunItems
          .map((item) => ({
            ...item,
            datasetRunName: run.name,
          }))
          .map(transformDbDatasetRunItemToAPIDatasetRunItem),
      };
    },
  }),
});

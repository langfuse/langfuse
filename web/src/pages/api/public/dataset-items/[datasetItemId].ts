import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import {
  GetDatasetItemV1Query,
  GetDatasetItemV1Response,
} from "@/src/features/public-api/types/datasets";
import { LangfuseNotFoundError } from "@langfuse/shared";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Dataset Item",
    querySchema: GetDatasetItemV1Query,
    responseSchema: GetDatasetItemV1Response,
    fn: async ({ query, auth }) => {
      const { datasetItemId } = query;

      const datasetItem = await prisma.datasetItem.findFirst({
        where: {
          id: datasetItemId,
          dataset: {
            projectId: auth.scope.projectId,
          },
        },
        include: {
          dataset: {
            select: {
              name: true,
            },
          },
        },
      });
      if (!datasetItem) {
        throw new LangfuseNotFoundError("Dataset item not found");
      }

      const { dataset, ...datasetItemBody } = datasetItem;
      return {
        ...datasetItemBody,
        datasetName: dataset.name,
      };
    },
  }),
});

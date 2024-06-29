import { prisma } from "@langfuse/shared/src/db";
import {
  GetDatasetV2Query,
  GetDatasetV2Response,
} from "@/src/features/public-api/types/datasets-v2";
import {
  ApiHandler,
  createAPIRoute,
} from "@/src/features/public-api/apiBuilder";

export default ApiHandler([
  createAPIRoute({
    method: "GET",
    name: "get-dataset",
    querySchema: GetDatasetV2Query,
    responseSchema: GetDatasetV2Response,
    fn: async ({ query, auth }) => {
      const { datasetName } = query;

      const dataset = await prisma.dataset.findFirst({
        where: {
          name: datasetName,
          projectId: auth.scope.projectId,
        },
      });

      if (!dataset) {
        throw new Error("Dataset not found");
      }
      return dataset;
    },
  }),
]);

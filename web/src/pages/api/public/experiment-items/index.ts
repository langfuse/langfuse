import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetExperimentItemsV1Query,
  GetExperimentItemsV1Response,
} from "@/src/features/public-api/types/experiments";
import { listExperimentItemsForPublicApi } from "@/src/features/experiments/server/public";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Experiment Items",
    querySchema: GetExperimentItemsV1Query,
    responseSchema: GetExperimentItemsV1Response,
    allowInAppAgentKey: true,
    fn: async ({ query, auth }) =>
      listExperimentItemsForPublicApi({
        projectId: auth.scope.projectId,
        query,
      }),
  }),
});

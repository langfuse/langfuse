import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetExperimentV1Query,
  GetExperimentV1Response,
} from "@/src/features/public-api/types/experiments";
import { getExperimentForPublicApi } from "@/src/features/experiments/server/public";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Experiment",
    querySchema: GetExperimentV1Query,
    responseSchema: GetExperimentV1Response,
    allowInAppAgentKey: true,
    fn: async ({ query, auth }) =>
      getExperimentForPublicApi({
        projectId: auth.scope.projectId,
        query,
      }),
  }),
});

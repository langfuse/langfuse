import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetExperimentsV1Query,
  GetExperimentsV1Response,
} from "@/src/features/public-api/types/experiments";
import { listExperimentsForPublicApi } from "@/src/features/experiments/server/public";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Experiments",
    querySchema: GetExperimentsV1Query,
    responseSchema: GetExperimentsV1Response,
    allowInAppAgentKey: true,
    fn: async ({ query, auth }) =>
      listExperimentsForPublicApi({
        projectId: auth.scope.projectId,
        query,
      }),
  }),
});

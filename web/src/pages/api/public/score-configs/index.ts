import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  createScoreConfig,
  listScoreConfigs,
} from "@/src/features/public-api/server/score-configs-api-service";
import {
  GetScoreConfigsQuery,
  GetScoreConfigsResponse,
  PostScoreConfigBody,
  PostScoreConfigResponse,
} from "@/src/features/public-api/types/score-configs";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Score Config",
    bodySchema: PostScoreConfigBody,
    responseSchema: PostScoreConfigResponse,
    fn: async ({ body, auth }) => {
      return await createScoreConfig({
        context: auth.scope,
        body,
      });
    },
  }),
  GET: createAuthedProjectAPIRoute({
    name: "Get Score Configs",
    querySchema: GetScoreConfigsQuery,
    responseSchema: GetScoreConfigsResponse,
    fn: async ({ query, auth }) => {
      const { page, limit } = query;
      return await listScoreConfigs({
        projectId: auth.scope.projectId,
        page,
        limit,
      });
    },
  }),
});

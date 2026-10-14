import { createAuthedProjectAPIRoute } from "@/src/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/public-api/server/withMiddlewares";
import {
  createScoreConfig,
  listScoreConfigs,
} from "@/src/public-api/server/score-configs-api-service";
import {
  GetScoreConfigsQuery,
  GetScoreConfigsResponse,
  PostScoreConfigBody,
  PostScoreConfigResponse,
} from "@/src/public-api/types/score-configs";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Score Config",
    action: "scoreConfigs:CUD",
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
    action: "scoreConfigs:read",
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

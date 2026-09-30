import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  AgentRunQuery,
  GetAgentRunResponse,
} from "@/src/features/public-api/types/agent";
import { getPublicAgentRun } from "@/src/features/in-app-agent/server/publicAgentService";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Agent Run",
    action: "project:read",
    querySchema: AgentRunQuery,
    responseSchema: GetAgentRunResponse,
    fn: ({ query, auth }) =>
      getPublicAgentRun({ runId: query.runId, scope: auth.scope }),
  }),
});

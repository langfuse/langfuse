import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  AgentRunQuery,
  AgentRunReference,
} from "@/src/features/public-api/types/agent";
import { cancelPublicAgentRun } from "@/src/features/in-app-agent/server/publicAgentService";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Cancel Agent Run",
    action: "project:read",
    querySchema: AgentRunQuery,
    responseSchema: AgentRunReference,
    fn: ({ query, auth }) =>
      cancelPublicAgentRun({ ...query, scope: auth.scope }),
  }),
});

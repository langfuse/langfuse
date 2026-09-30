import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  PostAgentConnectionBody,
  AgentConnectionResponse,
} from "@/src/features/public-api/types/agent-connections";
import { getOrCreateAgentUserConnection } from "@/src/features/in-app-agent/server/userConnectionService";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Resolve Agent User Connection",
    action: "project:read",
    bodySchema: PostAgentConnectionBody,
    responseSchema: AgentConnectionResponse,
    rateLimitResource: "in-app-agent-run",
    fn: ({ body, auth }) =>
      getOrCreateAgentUserConnection({ input: body, scope: auth.scope }),
  }),
});

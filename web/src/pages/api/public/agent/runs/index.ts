import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  PostAgentRunBody,
  AgentRunReference,
} from "@/src/features/public-api/types/agent";
import { startPublicAgentRun } from "@/src/features/in-app-agent/server/publicAgentService";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Start Agent Run",
    action: "project:read",
    bodySchema: PostAgentRunBody,
    responseSchema: AgentRunReference,
    successStatusCode: 202,
    rateLimitResource: "in-app-agent-run",
    fn: ({ body, auth }) =>
      startPublicAgentRun({ input: body, scope: auth.scope }),
  }),
});

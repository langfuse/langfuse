import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { GetPromptFilterOptionsV2Response } from "@/src/features/public-api/types/prompts";
import { getPromptFilterOptions } from "@/src/features/prompts/server/actions/getPromptFilterOptions";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Prompt Filter Options",
    responseSchema: GetPromptFilterOptionsV2Response,
    isAdminApiKeyAuthAllowed: true,
    fn: async ({ auth }) => {
      return getPromptFilterOptions({ projectId: auth.scope.projectId });
    },
  }),
});


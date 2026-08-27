import { LangfuseNotFoundError } from "@langfuse/shared";

import { env } from "@/src/env.mjs";
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
    fn: async ({ query, auth }) => {
      if (env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN !== "true") {
        throw new LangfuseNotFoundError(
          "The experiments API is only available in a Langfuse v4 write mode. Learn more at: https://langfuse.com/docs/v4",
        );
      }

      return listExperimentsForPublicApi({
        projectId: auth.scope.projectId,
        query,
      });
    },
  }),
});

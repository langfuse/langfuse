import { LangfuseNotFoundError } from "@langfuse/shared";

import { env } from "@/src/env.mjs";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetExperimentItemsV1Query,
  GetExperimentItemsV1Response,
} from "@/src/features/public-api/types/experiments";
import { listExperimentItemsForPublicApi } from "@/src/features/experiments/server/public";
import { clampToDataAccessDays } from "@/src/features/entitlements/server/hasEntitlementLimit";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Experiment Items",
    action: "experiments:read",
    querySchema: GetExperimentItemsV1Query,
    responseSchema: GetExperimentItemsV1Response,
    allowInAppAgentKey: true,
    fn: async ({ query, auth }) => {
      if (env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN !== "true") {
        throw new LangfuseNotFoundError(
          "The experiment items API is only available in a Langfuse v4 write mode. Learn more at: https://langfuse.com/docs/v4",
        );
      }

      const dataAccessWindow = clampToDataAccessDays({
        plan: auth.scope.plan,
        fromTimestamp: query.fromStartTime,
      });

      return listExperimentItemsForPublicApi({
        projectId: auth.scope.projectId,
        query: {
          ...query,
          fromStartTime:
            dataAccessWindow.effectiveFromTimestamp?.toISOString() ??
            query.fromStartTime,
        },
      });
    },
  }),
});

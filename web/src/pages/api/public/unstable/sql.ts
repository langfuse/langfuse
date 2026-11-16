import { z } from "zod";

import { executeCustomerSql } from "@langfuse/shared/src/server";
import { LangfuseNotFoundError } from "@langfuse/shared";

import { env } from "@/src/env.mjs";
import { clampToDataAccessDays } from "@/src/features/entitlements/server/hasEntitlementLimit";
import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";

const PostUnstableSqlBody = z.object({
  query: z.string().min(1),
});

const PostUnstableSqlResponse = z.object({
  columns: z.array(z.string()),
  data: z.array(z.record(z.string(), z.unknown())),
});

export default withUnstablePublicApiMiddlewares({
  POST: createUnstablePublicApiRoute({
    name: "Run Unstable SQL Query",
    action: "traces:read",
    bodySchema: PostUnstableSqlBody,
    responseSchema: PostUnstableSqlResponse,
    fn: async ({ body, auth }) => {
      if (env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN !== "true") {
        throw new LangfuseNotFoundError(
          "The SQL API is only available in a Langfuse v4 write mode. Learn more at: https://langfuse.com/docs/v4",
        );
      }
      const { accessFloor } = clampToDataAccessDays({ plan: auth.scope.plan });
      const { columns, rows } = await executeCustomerSql(
        body.query,
        auth.scope.projectId,
        { minStartTime: accessFloor },
      );
      return { columns, data: rows };
    },
  }),
});

import { v4 } from "uuid";
import { type z } from "zod/v4";

import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { isBooleanDataType } from "@/src/features/scores/lib/helpers";
import {
  filterAndValidateDbScoreConfigList,
  GetScoreConfigsQuery,
  GetScoreConfigsResponse,
  PostScoreConfigBody,
  PostScoreConfigResponse,
  validateDbScoreConfig,
} from "@langfuse/shared";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { traceException } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";

const inflateConfigBody = (body: z.infer<typeof PostScoreConfigBody>) => {
  if (isBooleanDataType(body.dataType)) {
    return {
      ...body,
      categories: [
        { label: "True", value: 1 },
        { label: "False", value: 0 },
      ],
    };
  }
  return body;
};

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Score Config",
    bodySchema: PostScoreConfigBody,
    responseSchema: PostScoreConfigResponse,
    fn: async ({ body, auth }) => {
      const inflatedConfigInput = inflateConfigBody(body);

      const config = await prisma.scoreConfig.create({
        data: {
          ...inflatedConfigInput,
          categories: inflatedConfigInput.categories ?? undefined,
          id: v4(),
          projectId: auth.scope.projectId,
        },
      });

      await auditLog({
        action: "create",
        resourceType: "scoreConfig",
        resourceId: config.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        after: config,
      });

      return validateDbScoreConfig(config);
    },
  }),
  GET: createAuthedProjectAPIRoute({
    name: "Get Score Configs",
    querySchema: GetScoreConfigsQuery,
    responseSchema: GetScoreConfigsResponse,
    fn: async ({ query, auth }) => {
      const { page, limit } = query;
      const rawConfigs = await prisma.scoreConfig.findMany({
        where: {
          projectId: auth.scope.projectId,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
        skip: (page - 1) * limit,
      });

      const configs = filterAndValidateDbScoreConfigList(
        rawConfigs,
        traceException,
      );

      const totalItemsRes = await prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`
          SELECT
            COUNT(*) as count
          FROM
            "score_configs" AS sc
          WHERE sc.project_id = ${auth.scope.projectId}
        `,
      );

      const totalItems =
        totalItemsRes[0] !== undefined ? Number(totalItemsRes[0].count) : 0;

      return {
        data: configs,
        meta: {
          page: page,
          limit: limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      };
    },
  }),
});

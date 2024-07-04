import { type z } from "zod";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { isBooleanDataType } from "@/src/features/manual-scoring/lib/helpers";
import { v4 } from "uuid";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  PostScoreConfigResponse,
  ScoreConfig,
  GetScoreConfigsResponse,
  GetScoreConfigsQuery,
  PostScoreConfigBody,
} from "@/src/features/public-api/types/score-configs";
import * as Sentry from "@sentry/node";
import { InvalidRequestError } from "@langfuse/shared";

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
  POST: createAuthedAPIRoute({
    name: "Create Score Config",
    bodySchema: PostScoreConfigBody,
    responseSchema: PostScoreConfigResponse,
    fn: async ({ body, auth }) => {
      const existingConfig = await prisma.scoreConfig.findFirst({
        where: {
          projectId: auth.scope.projectId,
          name: body.name,
          dataType: body.dataType,
        },
      });

      if (existingConfig) {
        throw new InvalidRequestError(
          "Score config with this name and data type already exists for this project",
        );
      }

      const inflatedConfigInput = inflateConfigBody(body);

      const config = await prisma.scoreConfig.create({
        data: {
          ...inflatedConfigInput,
          categories: inflatedConfigInput.categories ?? undefined,
          id: v4(),
          projectId: auth.scope.projectId,
        },
      });

      return config as z.infer<typeof ScoreConfig>;
    },
  }),
  GET: createAuthedAPIRoute({
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

      const configs = rawConfigs.reduce(
        (acc, config) => {
          if (ScoreConfig.safeParse(config).success) {
            acc.push(config as z.infer<typeof ScoreConfig>);
          } else {
            Sentry.captureException(
              new Error(`Invalid score config with id: ${config.id}`),
            );
          }
          return acc;
        },
        [] as z.infer<typeof ScoreConfig>[],
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

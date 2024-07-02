import { ScoreDataType, prisma } from "@langfuse/shared/src/db";
import { Prisma } from "@langfuse/shared/src/db";
import { ZodError, type z } from "zod";
import {
  type CastedConfig,
  LangfuseNotFoundError,
  InvalidRequestError,
  type InflatedPostScoreBody,
} from "@langfuse/shared";
import { eventTypes, ingestionBatchEvent } from "@langfuse/shared";
import { v4 } from "uuid";
import {
  handleBatch,
  handleBatchResultLegacy,
} from "@/src/pages/api/public/ingestion";
import {
  isBooleanDataType,
  isCastedConfig,
  isPresent,
} from "@/src/features/manual-scoring/lib/helpers";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  type GetScores,
  GetScoresQuery,
  GetScoresResponse,
  PostScoresBody,
  PostScoresResponse,
  ScoreBodyWithoutConfig,
  ScorePropsAgainstConfig,
  GetAllScores,
} from "@/src/features/public-api/types/scores";

const inferDataType = (value: string | number): ScoreDataType =>
  typeof value === "number" ? ScoreDataType.NUMERIC : ScoreDataType.CATEGORICAL;

const validateConfigAgainstBody = (
  body: z.infer<typeof PostScoresBody>,
  config: CastedConfig,
): void => {
  const { maxValue, minValue, categories, dataType: configDataType } = config;
  if (body.dataType && body.dataType !== configDataType) {
    throw new InvalidRequestError(
      `Data type mismatch based on config: expected ${configDataType}, got ${body.dataType}`,
    );
  }

  if (config.isArchived) {
    throw new InvalidRequestError(
      "Config is archived and cannot be used to create new scores. Please restore the config first.",
    );
  }

  if (config.name !== body.name) {
    throw new InvalidRequestError(
      `Name mismatch based on config: expected ${config.name}, got ${body.name}`,
    );
  }

  const relevantDataType = body.dataType ?? configDataType;

  const dataTypeValidation = ScoreBodyWithoutConfig.safeParse({
    ...body,
    dataType: relevantDataType,
  });
  if (!dataTypeValidation.success) {
    throw new ZodError(dataTypeValidation.error.errors);
  }

  const rangeValidation = ScorePropsAgainstConfig.safeParse({
    value: body.value,
    dataType: relevantDataType,
    ...(isPresent(maxValue) && { maxValue }),
    ...(isPresent(minValue) && { minValue }),
    ...(categories && { categories }),
  });
  if (!rangeValidation.success) {
    throw new ZodError(rangeValidation.error.errors);
  }
};

const mapStringValueToNumericValue = (
  config: CastedConfig,
  label: string,
): number | null =>
  config.categories?.find((category) => category.label === label)?.value ??
  null;

const inflateScoreBody = (
  body: z.infer<typeof PostScoresBody>,
  config?: CastedConfig,
): z.infer<typeof InflatedPostScoreBody> => {
  const relevantDataType = config?.dataType ?? body.dataType;
  if (typeof body.value === "number") {
    if (relevantDataType && isBooleanDataType(relevantDataType)) {
      return {
        ...body,
        value: body.value,
        stringValue: body.value === 1 ? "True" : "False",
        dataType: ScoreDataType.BOOLEAN,
      };
    }

    return {
      ...body,
      value: body.value,
      dataType: ScoreDataType.NUMERIC,
    };
  }
  return {
    ...body,
    value: config ? mapStringValueToNumericValue(config, body.value) : null,
    stringValue: body.value,
    dataType: ScoreDataType.CATEGORICAL,
  };
};

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Create Score",
    bodySchema: PostScoresBody,
    responseSchema: PostScoresResponse,
    fn: async ({ body, auth, req, res }) => {
      let inflatedBody: z.infer<typeof InflatedPostScoreBody>;
      if (body.configId) {
        const config = await prisma.scoreConfig.findFirst({
          where: {
            projectId: auth.scope.projectId,
            id: body.configId,
          },
        });

        if (!config || !isCastedConfig(config))
          throw new LangfuseNotFoundError(
            "The configId you provided does not match a valid config in this project",
          );

        validateConfigAgainstBody(body, config);
        inflatedBody = inflateScoreBody(body, config);
      } else {
        const validation = ScoreBodyWithoutConfig.safeParse({
          ...body,
          dataType: body.dataType ?? inferDataType(body.value),
        });
        if (!validation.success) {
          throw new ZodError(validation.error.errors);
        }
        inflatedBody = inflateScoreBody(body);
      }
      const event = {
        id: v4(),
        type: eventTypes.SCORE_CREATE,
        timestamp: new Date().toISOString(),
        body: inflatedBody,
      };
      const result = await handleBatch(
        ingestionBatchEvent.parse([event]),
        {},
        req,
        auth,
      );
      handleBatchResultLegacy(result.errors, result.results, res);
    },
  }),
  GET: createAuthedAPIRoute({
    name: "Get Scores",
    querySchema: GetScoresQuery,
    responseSchema: GetScoresResponse,
    fn: async ({ query, auth }) => {
      const {
        page,
        limit,
        configId,
        userId,
        name,
        fromTimestamp,
        source,
        operator,
        value,
        scoreIds,
      } = query;

      const skipValue = (page - 1) * limit;
      const configCondition = configId
        ? Prisma.sql`AND s."config_id" = ${configId}`
        : Prisma.empty;
      const userCondition = userId
        ? Prisma.sql`AND t."user_id" = ${userId}`
        : Prisma.empty;
      const nameCondition = name
        ? Prisma.sql`AND s."name" = ${name}`
        : Prisma.empty;
      const fromTimestampCondition = fromTimestamp
        ? Prisma.sql`AND s."timestamp" >= ${fromTimestamp}::timestamp with time zone at time zone 'UTC'`
        : Prisma.empty;
      const sourceCondition = source
        ? Prisma.sql`AND s."source" = ${source}`
        : Prisma.empty;
      const valueCondition =
        operator && value !== null && value !== undefined
          ? Prisma.sql`AND s."value" ${Prisma.raw(`${operator}`)} ${value}`
          : Prisma.empty;
      const scoreIdCondition = scoreIds
        ? Prisma.sql`AND s."id" = ANY(${scoreIds})`
        : Prisma.empty;

      const scores = await prisma.$queryRaw<Array<GetScores>>(Prisma.sql`
          SELECT
            s.id,
            s.timestamp,
            s.name,
            s.value,
            s.string_value as "stringValue",
            s.data_type as "dataType",
            s.source,
            s.comment,
            s.data_type as "dataType",
            s.config_id as "configId",
            s.trace_id as "traceId",
            s.observation_id as "observationId",
            json_build_object('userId', t.user_id) as "trace"
          FROM "scores" AS s
          LEFT JOIN "traces" AS t ON t.id = s.trace_id AND t.project_id = ${auth.scope.projectId}
          WHERE s.project_id = ${auth.scope.projectId}
          ${configCondition}
          ${userCondition}
          ${nameCondition}
          ${sourceCondition}
          ${fromTimestampCondition}
          ${valueCondition}
          ${scoreIdCondition}
          ORDER BY s."timestamp" DESC
          LIMIT ${limit} OFFSET ${skipValue}
          `);

      const totalItemsRes = await prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`
          SELECT COUNT(*) as count
          FROM "scores" AS s
          LEFT JOIN "traces" AS t ON t.id = s.trace_id AND t.project_id = ${auth.scope.projectId}
          WHERE s.project_id = ${auth.scope.projectId}
          ${userCondition}
          ${nameCondition}
          ${sourceCondition}
          ${fromTimestampCondition}
          ${valueCondition}
          ${scoreIdCondition}
        `,
      );

      const validatedScores = scores.reduce((acc, score) => {
        const result = GetAllScores.safeParse(score);
        if (result.success) {
          acc.push(result.data);
        }
        return acc;
      }, [] as GetScores[]);

      const totalItems =
        totalItemsRes[0] !== undefined ? Number(totalItemsRes[0].count) : 0;

      return {
        data: validatedScores,
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

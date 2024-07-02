import {
  type ScoreDataType,
  ScoreSource,
  prisma,
} from "@langfuse/shared/src/db";
import { Prisma } from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import {
  type InflatedScoreBody,
  paginationZod,
  type CastedConfig,
  GetAllScores,
  type GetScores,
} from "@langfuse/shared";
import {
  ScoreBody,
  eventTypes,
  ingestionBatchEvent,
  stringDate,
} from "@langfuse/shared";
import { v4 } from "uuid";
import {
  handleBatch,
  handleBatchResultLegacy,
} from "@/src/pages/api/public/ingestion";
import { isPrismaException } from "@/src/utils/exceptions";
import {
  isBooleanDataType,
  isCastedConfig,
  isCategoricalDataType,
  isNumericDataType,
  isPresent,
} from "@/src/features/manual-scoring/lib/helpers";

const validateScoreValueAgainstDataType = ({
  value,
  dataType,
}: {
  value: number | string;
  dataType: ScoreDataType;
}): { error: string } | { error: null } => {
  if (typeof value === "string") {
    if (isNumericDataType(dataType) || isBooleanDataType(dataType))
      return {
        error: `You may only pass a string value for categorical scores, received: ${value}`,
      };
  }
  if (typeof value === "number") {
    if (isBooleanDataType(dataType)) {
      if (value !== 0 && value !== 1) {
        return {
          error: `Boolean scores should have value of 0 or 1, received: ${value}`,
        };
      }
    }
    if (isCategoricalDataType(dataType)) {
      return {
        error: `Categorical scores should define a string value not a number, received: ${value}`,
      };
    }
  }
  return { error: null };
};

const validateScoreBody = ({
  parsedBody,
}: {
  parsedBody: z.infer<typeof ScoreBody>;
}): { error: string } | { error: null } => {
  if (parsedBody.dataType) {
    return validateScoreValueAgainstDataType({
      value: parsedBody.value,
      dataType: parsedBody.dataType,
    });
  }
  return { error: null };
};

const validateConfigAgainstBody = ({
  parsedBody,
  config,
}: {
  parsedBody: z.infer<typeof ScoreBody>;
  config: CastedConfig;
}): { error: string } | { error: null } => {
  if (parsedBody.dataType && parsedBody.dataType !== config.dataType) {
    return {
      error: `Data type mismatch based on config: expected ${config.dataType}, got ${parsedBody.dataType}`,
    };
  }

  if (config.isArchived) {
    return {
      error:
        "Config is archived and cannot be used to create new scores. Please restore the config first.",
    };
  }

  if (config.name !== parsedBody.name) {
    return {
      error: `Name mismatch based on config: expected ${config.name}, got ${parsedBody.name}`,
    };
  }

  const relevantDataType = parsedBody.dataType ?? config.dataType;
  const { error } = validateScoreValueAgainstDataType({
    value: parsedBody.value,
    dataType: relevantDataType,
  });
  if (error) return { error };

  if (isNumericDataType(relevantDataType)) {
    if (
      isPresent(config.maxValue) &&
      (parsedBody.value as number) > config.maxValue // score validated against data type
    ) {
      return {
        error: `Value exceeds maximum value of ${config.maxValue}`,
      };
    }
    if (
      isPresent(config.minValue) &&
      (parsedBody.value as number) < config.minValue // score validated against data type
    ) {
      return {
        error: `Value is below minimum value of ${config.minValue}`,
      };
    }
  }

  if (isCategoricalDataType(relevantDataType)) {
    if (!config.categories) {
      return {
        error:
          "Config invalid. Categorical data type should have config categories",
      };
    }
    if (!config.categories.some(({ label }) => label === parsedBody.value)) {
      return {
        error: `Value ${parsedBody.value} does not map to a valid category. Pass a valid category value.`,
      };
    }
  }

  return { error: null };
};

const mapStringValueToNumericValue = (
  config: CastedConfig,
  label: string,
): number | null =>
  config.categories?.find((category) => category.label === label)?.value ??
  null;

// Inflate the score body with the correct value and string value, called after validation
const inflateScoreBodyWithConfig = ({
  parsedBody,
  config,
}: {
  parsedBody: z.infer<typeof ScoreBody>;
  config: CastedConfig;
}): z.infer<typeof InflatedScoreBody> => {
  if (typeof parsedBody.value === "number") {
    if (isBooleanDataType(config.dataType)) {
      return {
        ...parsedBody,
        value: parsedBody.value,
        stringValue: parsedBody.value === 1 ? "True" : "False",
        dataType: parsedBody.dataType ?? config.dataType,
      };
    }

    return {
      ...parsedBody,
      value: parsedBody.value,
      stringValue: undefined,
      dataType: parsedBody.dataType ?? config.dataType,
    };
  }
  return {
    ...parsedBody,
    value: mapStringValueToNumericValue(config, parsedBody.value),
    stringValue: parsedBody.value,
    dataType: parsedBody.dataType ?? config.dataType,
  };
};

// Inflate the score body with the correct value and string value, called after validation
const inflateScoreBody = ({
  parsedBody,
}: {
  parsedBody: z.infer<typeof ScoreBody>;
}): z.infer<typeof InflatedScoreBody> => {
  if (typeof parsedBody.value === "number") {
    if (parsedBody.dataType && isBooleanDataType(parsedBody.dataType)) {
      return {
        ...parsedBody,
        value: parsedBody.value,
        stringValue: parsedBody.value === 1 ? "True" : "False",
      };
    }

    return {
      ...parsedBody,
      value: parsedBody.value,
      stringValue: undefined,
      dataType:
        parsedBody.dataType ?? typeof parsedBody.value === "number"
          ? "NUMERIC"
          : "CATEGORICAL",
    };
  }
  return {
    ...parsedBody,
    value: undefined,
    stringValue: parsedBody.value,
    dataType:
      parsedBody.dataType ?? typeof parsedBody.value === "number"
        ? "NUMERIC"
        : "CATEGORICAL",
  };
};

const operators = ["<", ">", "<=", ">=", "!=", "="] as const;

const ScoresGetSchema = z
  .object({
    ...paginationZod,
    userId: z.string().nullish(),
    configId: z.string().nullish(),
    name: z.string().nullish(),
    fromTimestamp: stringDate,
    source: z.nativeEnum(ScoreSource).nullish(),
    value: z.coerce.number().nullish(),
    operator: z.enum(operators).nullish(),
    scoreIds: z
      .string()
      .transform((str) => str.split(",").map((id) => id.trim())) // Split the comma-separated string
      .refine((arr) => arr.every((id) => typeof id === "string"), {
        message: "Each score ID must be a string",
      })
      .nullish(),
  })
  .strict(); // Use strict to give 400s on typo'd query params

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  // CHECK AUTH
  const authCheck = await verifyAuthHeaderAndReturnScope(
    req.headers.authorization,
  );
  if (!authCheck.validKey)
    return res.status(401).json({
      message: authCheck.error,
    });
  // END CHECK AUTH

  if (req.method === "POST") {
    try {
      console.log(
        "trying to create score, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2),
      );

      const parsedBody = ScoreBody.parse(req.body);
      let inflatedBody: z.infer<typeof InflatedScoreBody>;
      if (req.body.configId) {
        const config = await prisma.scoreConfig.findFirst({
          where: {
            projectId: authCheck.scope.projectId,
            id: req.body.configId,
          },
        });

        if (!config || !isCastedConfig(config))
          throw new Error(
            "The configId you provided does not match a valid config in this project",
          );
        const { error } = validateConfigAgainstBody({ parsedBody, config });
        if (error) {
          throw new Error(error, {
            cause: "Invalid request data - score body not valid",
          });
        }

        inflatedBody = inflateScoreBodyWithConfig({ parsedBody, config });
      } else {
        const { error } = validateScoreBody({ parsedBody });
        if (error) {
          throw new Error(error, {
            cause: "Invalid request data - score body not valid",
          });
        }
        inflatedBody = inflateScoreBody({ parsedBody });
      }

      const event = {
        id: v4(),
        type: eventTypes.SCORE_CREATE,
        timestamp: new Date().toISOString(),
        body: inflatedBody,
      };

      console.log({ inflatedBody });

      const result = await handleBatch(
        ingestionBatchEvent.parse([event]),
        {},
        req,
        authCheck,
      );

      handleBatchResultLegacy(result.errors, result.results, res);
    } catch (error: unknown) {
      console.error(error);
      if (isPrismaException(error)) {
        return res.status(500).json({
          error: "Internal Server Error",
        });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid request data",
          error: error.errors,
        });
      }
      if (
        error instanceof Error &&
        error.cause === "Invalid request data - score body not valid"
      ) {
        return res.status(400).json({
          message: "Invalid request data",
          error: error.message,
        });
      }

      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      res.status(500).json({
        message: "Invalid request data",
        error: errorMessage,
      });
    }
  } else if (req.method === "GET") {
    try {
      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message: "Access denied - need to use basic auth with secret key",
        });
      }

      const obj = ScoresGetSchema.parse(req.query); // uses query and not body

      const skipValue = (obj.page - 1) * obj.limit;
      const configCondition = obj.configId
        ? Prisma.sql`AND s."config_id" = ${obj.configId}`
        : Prisma.empty;
      const userCondition = obj.userId
        ? Prisma.sql`AND t."user_id" = ${obj.userId}`
        : Prisma.empty;
      const nameCondition = obj.name
        ? Prisma.sql`AND s."name" = ${obj.name}`
        : Prisma.empty;
      const fromTimestampCondition = obj.fromTimestamp
        ? Prisma.sql`AND s."timestamp" >= ${obj.fromTimestamp}::timestamp with time zone at time zone 'UTC'`
        : Prisma.empty;
      const sourceCondition = obj.source
        ? Prisma.sql`AND s."source" = ${obj.source}`
        : Prisma.empty;
      const valueCondition =
        obj.operator && obj.value !== null && obj.value !== undefined
          ? Prisma.sql`AND s."value" ${Prisma.raw(`${obj.operator}`)} ${obj.value}`
          : Prisma.empty;
      const scoreIdCondition = obj.scoreIds
        ? Prisma.sql`AND s."id" = ANY(${obj.scoreIds})`
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
          LEFT JOIN "traces" AS t ON t.id = s.trace_id AND t.project_id = ${authCheck.scope.projectId}
          WHERE s.project_id = ${authCheck.scope.projectId}
          ${configCondition}
          ${userCondition}
          ${nameCondition}
          ${sourceCondition}
          ${fromTimestampCondition}
          ${valueCondition}
          ${scoreIdCondition}
          ORDER BY s."timestamp" DESC
          LIMIT ${obj.limit} OFFSET ${skipValue}
          `);

      const totalItemsRes = await prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`
          SELECT COUNT(*) as count
          FROM "scores" AS s
          LEFT JOIN "traces" AS t ON t.id = s.trace_id AND t.project_id = ${authCheck.scope.projectId}
          WHERE s.project_id = ${authCheck.scope.projectId}
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

      return res.status(200).json({
        data: validatedScores,
        meta: {
          page: obj.page,
          limit: obj.limit,
          totalItems,
          totalPages: Math.ceil(totalItems / obj.limit),
        },
      });
    } catch (error: unknown) {
      console.error(error);
      if (isPrismaException(error)) {
        return res.status(500).json({
          error: "Internal Server Error",
        });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid request data",
          error: error.errors,
        });
      }
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      res.status(500).json({
        message: "Invalid request data",
        error: errorMessage,
      });
    }
  } else {
    return res.status(405).json({ message: "Method not allowed" });
  }
}

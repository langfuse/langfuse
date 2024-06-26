import { ScoreSource, prisma } from "@langfuse/shared/src/db";
import { Prisma, type Score } from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { paginationZod, type CastedConfig } from "@langfuse/shared";
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

  if (parsedBody.stringValue) {
    if (isNumericDataType(config.dataType)) {
      return {
        error:
          "You may only pass string values for categorical or boolean data types.",
      };
    }
    if (
      !config.categories?.some(({ label }) => label === parsedBody.stringValue)
    ) {
      return {
        error: `Value ${parsedBody.value} does not map to a valid category. Either pass a valid category value or remove the stringValue field and allow it to autopopulate.`,
      };
    }
    if (mapValueToString(config, parsedBody.value) !== parsedBody.stringValue) {
      return {
        error: `Value ${parsedBody.value} does not map to the provided string value.`,
      };
    }
  }

  if (isNumericDataType(config.dataType)) {
    if (isPresent(config.maxValue) && parsedBody.value > config.maxValue) {
      return {
        error: `Value exceeds maximum value of ${config.maxValue}`,
      };
    }
    if (isPresent(config.minValue) && parsedBody.value < config.minValue) {
      return {
        error: `Value is below minimum value of ${config.minValue}`,
      };
    }
  }

  if (isBooleanDataType(config.dataType)) {
    if (!config.categories) {
      return {
        error:
          "Config invalid. Boolean data type should have config categories",
      };
    }
    if (parsedBody.value !== 0 && parsedBody.value !== 1) {
      return {
        error: "Boolean data type should have value of 0 or 1",
      };
    }
  }

  if (isCategoricalDataType(config.dataType)) {
    if (!config.categories) {
      return {
        error:
          "Config invalid. Categorical data type should have config categories",
      };
    }
    if (
      !config.categories.find((category) => category.value === parsedBody.value)
    ) {
      return {
        error: `Value ${parsedBody.value} does not map to a valid category`,
      };
    }
  }

  return { error: null };
};

const mapValueToString = (config: CastedConfig, value: number): string | null =>
  config.categories?.find((category) => category.value === value)?.label ??
  null;

const inflateScoreBody = ({
  parsedBody,
  config,
}: {
  parsedBody: z.infer<typeof ScoreBody>;
  config: CastedConfig;
}): z.infer<typeof ScoreBody> => {
  if (!parsedBody.dataType) return parsedBody;

  if (
    isCategoricalDataType(parsedBody.dataType) ||
    isBooleanDataType(parsedBody.dataType)
  ) {
    return {
      ...parsedBody,
      stringValue: mapValueToString(config, parsedBody.value),
    };
  }

  return parsedBody;
};

const operators = ["<", ">", "<=", ">=", "!=", "="] as const;

const ScoresGetSchema = z
  .object({
    ...paginationZod,
    userId: z.string().nullish(),
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
      let inflatedBody = parsedBody;
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
            cause: "Invalid request data - score body not valid against config",
          });
        }

        inflatedBody = inflateScoreBody({ parsedBody, config });
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
        error.cause ===
          "Invalid request data - score body not valid against config"
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

      const scores = await prisma.$queryRaw<
        Array<Score & { trace: { userId: string } }>
      >(Prisma.sql`
          SELECT
            s.id,
            s.timestamp,
            s.name,
            s.value,
            s.source,
            s.comment,
            s.trace_id as "traceId",
            s.observation_id as "observationId",
            json_build_object('userId', t.user_id) as "trace"
          FROM "scores" AS s
          JOIN "traces" AS t ON t.id = s.trace_id AND t.project_id = ${authCheck.scope.projectId}
          WHERE s.project_id = ${authCheck.scope.projectId}
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
          JOIN "traces" AS t ON t.id = s.trace_id AND t.project_id = ${authCheck.scope.projectId}
          WHERE s.project_id = ${authCheck.scope.projectId}
          ${userCondition}
          ${nameCondition}
          ${sourceCondition}
          ${fromTimestampCondition}
          ${valueCondition}
          ${scoreIdCondition}
        `,
      );

      const totalItems =
        totalItemsRes[0] !== undefined ? Number(totalItemsRes[0].count) : 0;

      return res.status(200).json({
        data: scores,
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

import { ScoreSource, prisma } from "@langfuse/shared/src/db";
import { Prisma, type Score } from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { paginationZod } from "@langfuse/shared";
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

      const event = {
        id: v4(),
        type: eventTypes.SCORE_CREATE,
        timestamp: new Date().toISOString(),
        body: ScoreBody.parse(req.body),
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

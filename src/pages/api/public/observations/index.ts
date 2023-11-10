import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@/src/server/db";
import { paginationZod } from "@/src/utils/zod";
import { Prisma, type PrismaClient, type Observation } from "@prisma/client";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";

const ObservationsGetSchema = z.object({
  ...paginationZod,
  type: z.enum(["GENERATION", "SPAN", "EVENT"]).nullish(),
  name: z.string().nullish(),
  userId: z.string().nullish(),
  traceId: z.string().nullish(),
  parentObservationId: z.string().nullish(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (req.method !== "GET") {
    console.error(req.method, req.body, req.query);
    return res.status(405).json({ message: "Method not allowed" });
  }

  // CHECK AUTH
  const authCheck = await verifyAuthHeaderAndReturnScope(
    req.headers.authorization,
  );
  if (!authCheck.validKey)
    return res.status(401).json({
      message: authCheck.error,
    });
  // END CHECK AUTH

  try {
    console.log(
      "trying to get observations, project ",
      authCheck.scope.projectId,
      ", body:",
      JSON.stringify(req.query, null, 2),
    );

    if (authCheck.scope.accessLevel !== "all") {
      return res.status(401).json({
        message:
          "Access denied - need to use basic auth with secret key to GET generations",
      });
    }

    const searchParams = ObservationsGetSchema.parse(req.query);

    const [observations, totalObservations] = await getObservation(
      prisma,
      authCheck.scope.projectId,
      searchParams,
    );

    return res.status(200).json({
      data: observations,
      meta: {
        page: searchParams.page,
        limit: searchParams.limit,
        totalItems: totalObservations,
        totalPages: Math.ceil(totalObservations / searchParams.limit),
      },
    });
  } catch (error: unknown) {
    console.error(error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    res.status(400).json({
      message: "Invalid request data",
      error: errorMessage,
    });
  }
}

const getObservation = async (
  prisma: PrismaClient,
  authenticatedProjectId: string,
  query: z.infer<typeof ObservationsGetSchema>,
) => {
  const userIdCondition = query.userId
    ? Prisma.sql`AND traces."user_id" = ${query.userId}`
    : Prisma.empty;

  const nameCondition = query.name
    ? Prisma.sql`AND o."name" = ${query.name}`
    : Prisma.empty;

  const observationTypeCondition = query.type
    ? Prisma.sql`AND o."type" = ${query.type}::"ObservationType"`
    : Prisma.empty;

  const traceIdCondition = query.traceId
    ? Prisma.sql`AND o."trace_id" = ${query.traceId}`
    : Prisma.empty;

  const parentObservationIdCondition = query.parentObservationId
    ? Prisma.sql`AND o."parent_observation_id" = ${query.parentObservationId}`
    : Prisma.empty;

  const [observations, count] = await Promise.all([
    prisma.$queryRaw<Observation[]>`
      SELECT 
        o."id",
        o."name",
        o."start_time" AS "startTime",
        o."end_time" AS "endTime",
        o."parent_observation_id" AS "parentObservationId",
        o."type",
        o."metadata",
        o."model",
        o."input",
        o."output",
        o."level",
        o."status_message" AS "statusMessage",
        o."completion_start_time" AS "completionStartTime",
        o."completion_tokens" AS "completionTokens",
        o."prompt_tokens" AS "promptTokens",
        o."total_tokens" AS "totalTokens",
        o."version",
        o."project_id" AS "projectId",
        o."trace_id" AS "traceId",
        o."modelParameters" AS "modelParameters"
      FROM observations o LEFT JOIN traces ON o."trace_id" = traces."id"
      WHERE o."project_id" = ${authenticatedProjectId}
      ${nameCondition}
      ${userIdCondition}
      ${observationTypeCondition}
      ${traceIdCondition}
      ${parentObservationIdCondition}
      ORDER by o."start_time" DESC
      OFFSET ${(query.page - 1) * query.limit}
      LIMIT ${query.limit}
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) FROM observations o LEFT JOIN traces ON o."trace_id" = traces."id"
      WHERE o."project_id" = ${authenticatedProjectId}
      ${observationTypeCondition}
      ${nameCondition}
      ${userIdCondition}
      ${traceIdCondition}
      ${parentObservationIdCondition}
  `,
  ]);

  if (!count || count.length !== 1) {
    throw new Error(
      `Unexpected number of results for count query: ${JSON.stringify(count)}`,
    );
  } else {
    return [observations, Number(count[0]?.count)] as const;
  }
};

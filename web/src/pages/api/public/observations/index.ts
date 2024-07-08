import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { mapUsageOutput } from "@/src/features/public-api/server/outputSchemaConversion";
import { prisma } from "@langfuse/shared/src/db";
import {
  ObservationLevel,
  paginationMetaResponseZod,
  paginationZod,
  validateZodSchema,
} from "@langfuse/shared";
import {
  Prisma,
  type PrismaClient,
  type ObservationView,
} from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { isPrismaException } from "@/src/utils/exceptions";
import { stringDate } from "@langfuse/shared";

const ObservationType = z.enum(["GENERATION", "SPAN", "EVENT"]);

const GetObservationsV1Query = z.object({
  ...paginationZod,
  type: ObservationType.nullish(),
  name: z.string().nullish(),
  userId: z.string().nullish(),
  traceId: z.string().nullish(),
  parentObservationId: z.string().nullish(),
  fromStartTime: stringDate,
});

const Observation = z.object({
  id: z.string(),
  projectId: z.string(),
  traceId: z.string().nullable(),
  parentObservationId: z.string().nullable(),
  name: z.string().nullable(),
  type: ObservationType,
  startTime: z.coerce.date(),
  endTime: z.coerce.date().nullable(),
  version: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  input: z.any(),
  output: z.any(),
  metadata: z.any(),
  level: z.enum(["DEBUG", "DEFAULT", "WARNING", "ERROR"]),
  statusMessage: z.string().nullable(),

  // metrics
  latency: z.number().nullable(),

  // GENERATION only
  model: z.string().nullable(),
  modelParameters: z.any(),
  completionStartTime: z.coerce.date().nullable(),
  promptId: z.string().nullable(),
  modelId: z.string().nullable(),

  // usage
  usage: z.object({
    unit: z.string().nullable(),
    input: z.number(),
    output: z.number(),
    total: z.number(),
  }),
  unit: z.string().nullable(),
  promptTokens: z.number(), // backwards compatibility
  completionTokens: z.number(), // backwards compatibility
  totalTokens: z.number(), // backwards compatibility

  // costs
  inputPrice: z.number().nullable(),
  outputPrice: z.number().nullable(),
  totalPrice: z.number().nullable(),
  calculatedInputCost: z.number().nullable(),
  calculatedOutputCost: z.number().nullable(),
  calculatedTotalCost: z.number().nullable(),

  // generation metrics
  timeToFirstToken: z.number().nullable(),
});

const GetObservationsV1Response = z.object({
  data: z.array(Observation),
  meta: paginationMetaResponseZod,
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

  try {
    // CHECK AUTH
    const authCheck = await verifyAuthHeaderAndReturnScope(
      req.headers.authorization,
    );
    if (!authCheck.validKey)
      return res.status(401).json({
        message: authCheck.error,
      });
    // END CHECK AUTH
    console.log(
      "trying to get observations, project ",
      authCheck.scope.projectId,
      ", body:",
      JSON.stringify(req.query, null, 2),
    );

    if (authCheck.scope.accessLevel !== "all") {
      return res.status(401).json({
        message: "Access denied - need to use basic auth with secret key",
      });
    }

    const searchParams = GetObservationsV1Query.parse(req.query);

    const [observations, totalObservations] = await getObservation(
      prisma,
      authCheck.scope.projectId,
      searchParams,
    );

    const response = validateZodSchema(GetObservationsV1Response, {
      data: observations.map(mapUsageOutput),
      meta: {
        page: searchParams.page,
        limit: searchParams.limit,
        totalItems: totalObservations,
        totalPages: Math.ceil(totalObservations / searchParams.limit),
      },
    });

    return res.status(200).json(response);
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
}

const getObservation = async (
  prisma: PrismaClient,
  authenticatedProjectId: string,
  query: z.infer<typeof GetObservationsV1Query>,
): Promise<[ObservationView[], number]> => {
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

  const fromStartTimeCondition = query.fromStartTime
    ? Prisma.sql`AND o."start_time" >= ${query.fromStartTime}::timestamp with time zone at time zone 'UTC'`
    : Prisma.empty;

  const observations = await prisma.$queryRaw<ObservationView[]>`
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
        o."unit" AS "unit",
        o."version",
        o."project_id" AS "projectId",
        o."trace_id" AS "traceId",
        o."modelParameters" AS "modelParameters",
        o."model_id" as "modelId",
        o."input_price" as "inputPrice",
        o."output_price" as "outputPrice",
        o."total_price" as "totalPrice",
        o."calculated_input_cost" as "calculatedInputCost",
        o."calculated_output_cost" as "calculatedOutputCost",
        o."calculated_total_cost" as "calculatedTotalCost",
        o."latency",
        o."prompt_id" as "promptId"
      FROM observations_view o LEFT JOIN traces ON o."trace_id" = traces."id" AND traces."project_id" = o."project_id"
      WHERE o."project_id" = ${authenticatedProjectId}
      ${nameCondition}
      ${userIdCondition}
      ${observationTypeCondition}
      ${traceIdCondition}
      ${parentObservationIdCondition}
      ${fromStartTimeCondition}
      ORDER by o."start_time" DESC
      OFFSET ${(query.page - 1) * query.limit}
      LIMIT ${query.limit}
    `;
  const count = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) FROM observations o LEFT JOIN traces ON o."trace_id" = traces."id"
      WHERE o."project_id" = ${authenticatedProjectId}
      ${observationTypeCondition}
      ${nameCondition}
      ${userIdCondition}
      ${traceIdCondition}
      ${parentObservationIdCondition}
      ${fromStartTimeCondition}
  `;

  if (count.length !== 1) {
    throw new Error(
      `Unexpected number of results for count query: ${JSON.stringify(count)}`,
    );
  } else {
    return [observations, Number(count[0]?.count)] as const;
  }
};

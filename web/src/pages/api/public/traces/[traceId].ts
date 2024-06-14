import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { mapUsageOutput } from "@/src/features/public-api/server/outputSchemaConversion";
import {
  ObservationLevel,
  ObservationType,
  prisma,
} from "@langfuse/shared/src/db";
import { isPrismaException } from "@/src/utils/exceptions";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { env } from "@/src/env.mjs";
import {
  getObservations,
  getScores,
  getTraces,
} from "@/src/server/api/repositories/clickhouse";
import { type observationRecordRead } from "@langfuse/shared/backend";
import Decimal from "decimal.js";

const GetTraceSchema = z.object({
  traceId: z.string(),
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
    console.log("Trying to get trace:", req.body, req.query);

    const { traceId } = GetTraceSchema.parse(req.query);

    // CHECK ACCESS SCOPE
    if (authCheck.scope.accessLevel !== "all") {
      return res.status(401).json({
        message: "Access denied - need to use basic auth with secret key",
      });
    }
    // END CHECK ACCESS SCOPE

    console.log(
      `get trace ${traceId} for project ${authCheck.scope.projectId}`,
    );

    const trace = env.SERVE_FROM_CLICKHOUSE
      ? await queryTracesAndScoresFromClickhouse(
          traceId,
          authCheck.scope.projectId,
        )
      : await prisma.trace.findFirst({
          where: {
            id: traceId,
            projectId: authCheck.scope.projectId,
          },
          include: {
            scores: true,
          },
        });

    if (!trace) {
      return res.status(404).json({
        message: "Trace not found within authorized project",
      });
    }

    const observations = env.SERVE_FROM_CLICKHOUSE
      ? await getObservations(traceId, authCheck.scope.projectId)
      : await prisma.observationView.findMany({
          where: {
            traceId: traceId,
            projectId: authCheck.scope.projectId,
          },
        });

    console.log("Return trace:", trace, observations);
    return res.status(200).json({
      ...trace,
      externalId: null,
      htmlPath: `/project/${authCheck.scope.projectId}/traces/${traceId}`,
      totalCost: 0,
      // observations.reduce(
      //   (acc, obs) => acc + (obs.calculatedTotalCost ?? 0),
      //   0,
      // ),
      observations: observations,
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
}

const queryTracesAndScoresFromClickhouse = async (
  traceId: string,
  projectId: string,
): Promise<any> => {
  const traces = await getTraces(traceId, projectId);
  const scores = await getScores(traceId, projectId);

  if (traces.length === 0) {
    return undefined;
  }

  if (traces.length > 1) {
    throw new Error("Multiple traces found");
  }

  return {
    ...traces[0],
    scores: scores,
  };
};

function convertObservations(
  observations: z.infer<typeof observationRecordRead>[],
) {
  return observations.map(convertObservationModelToApi);
}

function convertObservationModelToApi(
  observation: z.infer<typeof observationRecordRead>,
) {
  return mapUsageOutput({
    id: observation.id,
    traceId: observation.trace_id ?? null,
    projectId: observation.project_id,
    startTime: new Date(observation.start_time),
    endTime: observation.end_time ? new Date(observation.end_time) : null,
    createdAt: new Date(observation.created_at) ?? null,
    inputPrice: observation.input_cost
      ? new Decimal(observation.input_cost)
      : null,
    outputPrice: observation.output_cost
      ? new Decimal(observation.output_cost)
      : null,
    totalPrice: observation.total_cost
      ? new Decimal(observation.total_cost)
      : null,
    promptTokens: observation.input_usage ? observation.input_usage : 0,
    completionTokens: observation.output_usage ? observation.output_usage : 0,
    totalTokens: observation.total_usage ? observation.total_usage : 0,
    parentObservationId: observation.parent_observation_id ?? null,
    modelParameters: observation.model_parameters ?? null,
    promptId: observation.prompt_id ?? null,
    modelId: observation.internal_model ?? null,
    statusMessage: observation.status_message ?? null,
    calculatedInputCost: observation.input_cost
      ? new Decimal(observation.input_cost)
      : null,
    calculatedOutputCost: observation.output_cost
      ? new Decimal(observation.output_cost)
      : null,
    calculatedTotalCost: observation.total_cost
      ? new Decimal(observation.total_cost)
      : null,
    completionStartTime: observation.completion_start_time ?? null,
    timeToFirstToken: null,
    latency: null,
    type: ObservationType[observation.type as keyof typeof ObservationType],
    name: observation.name ?? null,
    level: ObservationLevel[observation.type as keyof typeof ObservationLevel],
    version: observation.version ?? null,
    model: observation.model ?? null,
    input: observation.input ?? null,
    output: observation.output ?? null,
    unit: observation.unit ?? null,
    metadata: observation.metadata,
  });
}

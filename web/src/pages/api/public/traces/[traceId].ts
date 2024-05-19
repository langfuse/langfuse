import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { mapUsageOutput } from "@/src/features/public-api/server/outputSchemaConversion";
import { prisma } from "@langfuse/shared/src/db";
import { isPrismaException } from "@/src/utils/exceptions";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { clickhouseClient } from "@langfuse/shared/backend";
import { env } from "@/src/env.mjs";

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

    const queryFromClickhouse = async (): Promise<any> => {
      const trace = await clickhouseClient.query({
        query: `SELECT * FROM traces_view where id = '${traceId}' and project_id = '${authCheck.scope.projectId}' LIMIT 1`,
        format: "JSONEachRow",
      });
      const traceJson = (await trace.json()) as unknown[];

      const scores = await clickhouseClient.query({
        query: `SELECT * FROM scores_view where trace_id = '${traceId}' and project_id = '${authCheck.scope.projectId}'`,
        format: "JSONEachRow",
      });

      const scoreJson = await scores.json();

      console.log(traceJson, scoreJson);
      const final = traceJson.length > 0 ? (traceJson[0] as object) : {};

      return {
        ...final,
        metadata:
          "metadata" in final &&
          final.metadata !== null &&
          typeof final.metadata === "object" &&
          Object.keys(final.metadata).length === 0
            ? null
            : "metadata" in final
              ? final.metadata
              : null,
        scores: scoreJson,
      };
    };

    const trace = env.SERVE_FROM_CLICKHOUSE
      ? await queryFromClickhouse()
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

    const clickhouseObs = async () => {
      const observations = await clickhouseClient.query({
        query: `SELECT * FROM observations_view where trace_id = '${traceId}' and project_id = '${authCheck.scope.projectId}'`,
        format: "JSONEachRow",
      });
      const obs = await observations.json();
      const parsedObs = obs.map((observation) => {
        if (typeof observation === "object" && observation) {
          if (
            "model_parameters" in observation &&
            observation.model_parameters &&
            typeof observation.model_parameters === "string"
          ) {
            observation.model_parameters = JSON.parse(
              observation.model_parameters,
            );
          }
          if (
            "input" in observation &&
            observation.input &&
            typeof observation.input === "string"
          ) {
            observation.input = JSON.parse(observation.input);
          }
          if (
            "output" in observation &&
            observation.output &&
            typeof observation.output === "string"
          ) {
            try {
              observation.output = JSON.parse(observation.output);
            } catch (e) {}
          }
        }
        return observation;
      });
      return parsedObs;
    };

    const observations = env.SERVE_FROM_CLICKHOUSE
      ? await clickhouseObs()
      : await prisma.observationView.findMany({
          where: {
            traceId: traceId,
            projectId: authCheck.scope.projectId,
          },
        });

    console.log("Got trace:", trace, observations);
    return res.status(200).json({
      ...trace,
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

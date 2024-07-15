import { prisma } from "@langfuse/shared/src/db";
import {
  GetObservationV1Query,
  GetObservationV1Response,
  transformDbToApiObservation,
} from "@/src/features/public-api/types/observations";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { mapUsageOutput } from "@/src/features/public-api/server/outputSchemaConversion";
import { isPrismaException } from "@/src/utils/exceptions";
import { env } from "@/src/env.mjs";
import { getObservation } from "@/src/server/api/repositories/clickhouse";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Observation",
    querySchema: GetObservationV1Query,
    responseSchema: GetObservationV1Response,
    fn: async ({ query, auth }) => {
      const { observationId } = query;
      const observation = await prisma.observationView.findFirst({
        where: {
          id: observationId,
          projectId: auth.scope.projectId,
        },
      });
      if (!observation) {
        throw new LangfuseNotFoundError(
          "Observation not found within authorized project",
        );
      }
      return transformDbToApiObservation(observation);
    },
  }),
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
    console.log("Trying to get observation:", req.body, req.query);

    const { observationId } = GetObservationSchema.parse(req.query);

    // CHECK ACCESS SCOPE
    if (authCheck.scope.accessLevel !== "all") {
      return res.status(401).json({
        message: "Access denied - need to use basic auth with secret key",
      });
    }
    // END CHECK ACCESS SCOPE

    const observation = env.CLICKHOUSE_URL
      ? await getObservation(observationId, authCheck.scope.projectId)
      : await prisma.observationView.findFirst({
          where: {
            id: observationId,
            projectId: authCheck.scope.projectId,
          },
        });
    if (!observation) {
      return res.status(404).json({
        message: "Observation not found within authorized project",
      });
    }
    return res.status(200).json(observation); //mapUsageOutput(observation));
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

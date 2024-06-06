import { prisma } from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { isPrismaException } from "@/src/utils/exceptions";
import { jsonSchema } from "@langfuse/shared";

const DatasetRunItemPostSchema = z
  .object({
    runName: z.string(),
    runDescription: z.string().nullish(),
    metadata: jsonSchema.nullish(),
    datasetItemId: z.string(),
    observationId: z.string().nullish(),
    traceId: z.string().nullish(),
  })
  .refine((data) => data.observationId || data.traceId, {
    message: "observationId or traceId must be provided",
    path: ["observationId", "traceId"], // Specify the path of the error
  });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  if (req.method === "POST") {
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

      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message: "Access denied - need to use basic auth with secret key",
        });
      }
      console.log(
        "trying to create dataset run item, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2),
      );
      const {
        datasetItemId,
        observationId,
        traceId,
        runName,
        runDescription,
        metadata,
      } = DatasetRunItemPostSchema.parse(req.body);

      const datasetItem = await prisma.datasetItem.findUnique({
        where: {
          id: datasetItemId,
          status: "ACTIVE",
          dataset: {
            projectId: authCheck.scope.projectId,
          },
        },
        include: {
          dataset: true,
        },
      });
      if (!datasetItem) {
        console.error("item not found");
        return res.status(404).json({
          message: "Dataset item not found or not active",
        });
      }

      let finalTraceId = traceId;

      // Backwards compatibility: historically, dataset run items were linked to observations, not traces
      if (!traceId && observationId) {
        const observation = observationId
          ? await prisma.observation.findUnique({
              where: {
                id: observationId,
                projectId: authCheck.scope.projectId,
              },
            })
          : undefined;
        if (observationId && !observation) {
          console.error("Observation not found");
          return res.status(404).json({
            message: "Observation not found",
          });
        }
        finalTraceId = observation?.traceId;
      }

      // double check, should not be necessary due to zod schema + validations above
      if (!finalTraceId) {
        console.error("No traceId set");
        return res.status(404).json({
          message: "No traceId set",
        });
      }

      const run = await prisma.datasetRuns.upsert({
        where: {
          datasetId_name: {
            datasetId: datasetItem.datasetId,
            name: runName,
          },
        },
        create: {
          name: runName,
          description: runDescription ?? undefined,
          datasetId: datasetItem.datasetId,
          metadata: metadata ?? undefined,
        },
        update: {
          metadata: metadata ?? undefined,
          description: runDescription ?? undefined,
        },
      });

      const runItem = await prisma.datasetRunItems.create({
        data: {
          datasetItemId: datasetItemId,
          traceId: finalTraceId,
          observationId,
          datasetRunId: run.id,
        },
      });

      return res.status(200).json({ ...runItem, datasetRunName: run.name });
    } catch (error: unknown) {
      console.error(error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid request data",
          error: error.errors,
        });
      }
      if (isPrismaException(error)) {
        return res.status(500).json({
          error: "Internal Server Error",
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

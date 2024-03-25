import { prisma } from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { isPrismaException } from "@/src/utils/exceptions";
import { jsonSchema } from "@/src/utils/zod";

const DatasetRunItemPostSchema = z.object({
  runName: z.string(),
  metadata: jsonSchema.nullish(),
  datasetItemId: z.string(),
  observationId: z.string(),
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
          message:
            "Access denied - need to use basic auth with secret key to GET scores",
        });
      }
      console.log(
        "trying to create dataset run item, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2),
      );
      const { datasetItemId, observationId, runName, metadata } =
        DatasetRunItemPostSchema.parse(req.body);

      const item = await prisma.datasetItem.findUnique({
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
      const observation = await prisma.observation.findUnique({
        where: {
          id: observationId,
          projectId: authCheck.scope.projectId,
        },
      });

      // Validity of id and access checks
      if (!item) {
        console.error("item not found");
        return res.status(404).json({
          message: "Dataset item not found or not active",
        });
      }
      if (!observation) {
        console.error("observation not found");
        return res.status(404).json({
          message: "Observation not found",
        });
      }

      const run = await prisma.datasetRuns.upsert({
        where: {
          datasetId_name: {
            datasetId: item.datasetId,
            name: runName,
          },
        },
        create: {
          name: runName,
          datasetId: item.datasetId,
          metadata: metadata ?? undefined,
        },
        update: {
          metadata: metadata ?? undefined,
        },
      });

      const runItem = await prisma.datasetRunItems.create({
        data: {
          datasetItemId: datasetItemId,
          observationId: observationId,
          datasetRunId: run.id,
        },
      });

      return res.status(200).json(runItem);
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

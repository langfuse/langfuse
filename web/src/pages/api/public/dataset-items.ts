import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { DatasetStatus, prisma } from "@langfuse/shared/src/db";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { jsonSchema } from "@langfuse/shared";
import { v4 as uuidv4 } from "uuid";
import { isPrismaException } from "@/src/utils/exceptions";

const CreateDatasetItemSchema = z.object({
  datasetName: z.string(),
  input: jsonSchema.nullish(),
  expectedOutput: jsonSchema.nullish(),
  metadata: jsonSchema.nullish(),
  id: z.string().nullish(),
  sourceTraceId: z.string().nullish(),
  sourceObservationId: z.string().nullish(),
  status: z.nativeEnum(DatasetStatus).nullish(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  try {
    if (req.method === "POST") {
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
        "Trying to upsert dataset item, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2),
      );

      const itemBody = CreateDatasetItemSchema.parse(req.body);

      // CHECK ACCESS SCOPE
      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message: "Access denied - need to use basic auth with secret key",
        });
      }
      // END CHECK ACCESS SCOPE

      // Check access to dataset
      const dataset = await prisma.dataset.findFirst({
        where: {
          projectId: authCheck.scope.projectId,
          name: itemBody.datasetName,
        },
      });
      if (!dataset) {
        return res.status(404).json({
          message: "Dataset not found",
        });
      }
      const id = itemBody.id ?? uuidv4();

      const item = await prisma.datasetItem.upsert({
        where: {
          id,
          datasetId: dataset.id,
        },
        create: {
          id,
          input: itemBody.input ?? undefined,
          expectedOutput: itemBody.expectedOutput ?? undefined,
          datasetId: dataset.id,
          metadata: itemBody.metadata ?? undefined,
          sourceTraceId: itemBody.sourceTraceId ?? undefined,
          sourceObservationId: itemBody.sourceObservationId ?? undefined,
          status: itemBody.status ?? undefined,
        },
        update: {
          input: itemBody.input ?? undefined,
          expectedOutput: itemBody.expectedOutput ?? undefined,
          metadata: itemBody.metadata ?? undefined,
          sourceTraceId: itemBody.sourceTraceId ?? undefined,
          sourceObservationId: itemBody.sourceObservationId ?? undefined,
          status: itemBody.status ?? undefined,
        },
      });

      res.status(200).json({
        ...item,
        datasetName: dataset.name,
      });
    } else {
      res.status(405).json({
        message: "Method not allowed",
      });
    }
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
}

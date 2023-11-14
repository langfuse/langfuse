import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@/src/server/db";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { jsonSchema } from "@/src/utils/zod";

const CreateDatasetItemSchema = z.object({
  datasetName: z.string(),
  input: jsonSchema,
  expectedOutput: jsonSchema.nullish(),
});

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

  try {
    if (req.method === "POST") {
      console.log(
        "Trying to create dataset, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2),
      );

      const { datasetName, input, expectedOutput } =
        CreateDatasetItemSchema.parse(req.body);

      // CHECK ACCESS SCOPE
      if (authCheck.scope.accessLevel !== "all")
        return res.status(403).json({
          message: "Access denied",
        });
      // END CHECK ACCESS SCOPE

      // Check access to dataset
      const dataset = await prisma.dataset.findFirst({
        where: {
          projectId: authCheck.scope.projectId,
          name: datasetName,
        },
      });
      if (!dataset) {
        return res.status(404).json({
          message: "Dataset not found",
        });
      }

      const item = await prisma.datasetItem.create({
        data: {
          input,
          expectedOutput: expectedOutput ?? undefined,
          datasetId: dataset.id,
        },
      });

      res.status(200).json(item);
    }
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

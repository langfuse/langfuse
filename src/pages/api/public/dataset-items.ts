import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/publicApi/server/cors";
import { prisma } from "@/src/server/db";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/publicApi/server/apiAuth";

const CreateDatasetItemSchema = z.object({
  datasetName: z.string(),
  input: z.string().refine((value) => {
    try {
      JSON.parse(value);
      return true;
    } catch (error) {
      return false;
    }
  }, "must be valid JSON"),
  expectedOutput: z
    .string()
    .optional()
    .refine((value) => {
      if (value === undefined) return true;
      try {
        JSON.parse(value);
        return true;
      } catch (error) {
        return false;
      }
    }, "must be valid JSON"),
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
      success: false,
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
          success: false,
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
          success: false,
          message: "Dataset not found",
        });
      }

      const item = await prisma.datasetItem.create({
        data: {
          input,
          expectedOutput,
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
      success: false,
      message: "Invalid request data",
      error: errorMessage,
    });
  }
}

import { prisma } from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { isPrismaException } from "@/src/utils/exceptions";

const DatasetsGetSchema = z.object({
  datasetName: z.string().transform((val) => decodeURIComponent(val)),
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

  if (authCheck.scope.accessLevel !== "all") {
    return res.status(401).json({
      message: "Access denied - need to use basic auth with secret key",
    });
  }

  if (req.method === "GET") {
    try {
      console.log(
        "trying to get dataset, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2),
        ", query:",
        JSON.stringify(req.query, null, 2),
      );
      const { datasetName } = DatasetsGetSchema.parse(req.query);

      const dataset = await prisma.dataset.findFirst({
        where: {
          name: datasetName,
          projectId: authCheck.scope.projectId,
        },
      });

      if (!dataset) {
        return res.status(404).json({
          message: "Dataset not found",
        });
      }

      return res.status(200).json(dataset);
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
  } else {
    return res.status(405).json({ message: "Method not allowed" });
  }
}

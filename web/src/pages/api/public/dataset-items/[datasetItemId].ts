import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { isPrismaException } from "@/src/utils/exceptions";

const GetDatasetItemQuerySchema = z.object({
  datasetItemId: z.string(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  try {
    if (req.method === "GET") {
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
        "Trying to get dataset item, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2),
        ", query:",
        JSON.stringify(req.query, null, 2),
      );

      const { datasetItemId } = GetDatasetItemQuerySchema.parse(req.query);

      // CHECK ACCESS SCOPE
      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message: "Access denied - need to use basic auth with secret key",
        });
      }
      // END CHECK ACCESS SCOPE

      // Check access to dataset
      const datasetItem = await prisma.datasetItem.findFirst({
        where: {
          id: datasetItemId,
          dataset: {
            projectId: authCheck.scope.projectId,
          },
        },
        include: {
          dataset: {
            select: {
              name: true,
            },
          },
        },
      });
      if (!datasetItem) {
        return res.status(404).json({
          message: "Dataset item not found (for this project)",
        });
      }

      const { dataset, ...datasetItemBody } = datasetItem;
      res.status(200).json({
        ...datasetItemBody,
        datasetName: dataset.name,
      });
    } else {
      res.status(405).json({
        message: "Method not allowed",
      });
    }
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

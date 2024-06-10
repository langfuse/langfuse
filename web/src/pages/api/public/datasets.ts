import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { isPrismaException } from "@/src/utils/exceptions";
import { jsonSchema, paginationZod } from "@langfuse/shared";

const CreateDatasetSchema = z.object({
  name: z.string(),
  description: z.string().nullish(),
  metadata: jsonSchema.nullish(),
});

const GetDatasetsSchema = z.object({
  ...paginationZod,
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

      const { name, description, metadata } = CreateDatasetSchema.parse(
        req.body,
      );

      // CHECK ACCESS SCOPE
      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message: "Access denied - need to use basic auth with secret key",
        });
      }
      // END CHECK ACCESS SCOPE

      const dataset = await prisma.dataset.upsert({
        where: {
          projectId_name: {
            projectId: authCheck.scope.projectId,
            name,
          },
        },
        create: {
          name,
          description: description ?? undefined,
          projectId: authCheck.scope.projectId,
          metadata: metadata ?? undefined,
        },
        update: {
          description: description ?? null,
          metadata: metadata ?? undefined,
        },
      });

      res.status(200).json({ ...dataset, items: [], runs: [] });
    } else if (req.method === "GET") {
      // CHECK ACCESS SCOPE
      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message: "Access denied - need to use basic auth with secret key",
        });
      }
      // END CHECK ACCESS SCOPE

      const args = GetDatasetsSchema.parse(req.query); // uses query and not body
      console.log("Trying to get datasets", args);

      const datasets = await prisma.dataset.findMany({
        select: {
          name: true,
          description: true,
          metadata: true,
          projectId: true,
          createdAt: true,
          updatedAt: true,
          id: true,
          datasetItems: {
            select: {
              id: true,
            },
            orderBy: {
              createdAt: "desc",
            },
          },
          datasetRuns: {
            select: {
              name: true,
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
        where: {
          projectId: authCheck.scope.projectId,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: args.limit,
        skip: (args.page - 1) * args.limit,
      });

      console.log("Found datasets", datasets);

      const totalItems = await prisma.dataset.count({
        where: {
          projectId: authCheck.scope.projectId,
        },
      });

      return res.status(200).json({
        data: datasets.map(({ datasetItems, datasetRuns, ...rest }) => ({
          ...rest,
          items: datasetItems.map(({ id }) => id),
          runs: datasetRuns.map(({ name }) => name),
        })),
        meta: {
          page: args.page,
          limit: args.limit,
          totalItems,
          totalPages: Math.ceil(totalItems / args.limit),
        },
      });
    } else {
      res.status(405).json({
        message: "Method Not Allowed",
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

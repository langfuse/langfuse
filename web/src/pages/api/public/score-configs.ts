import { type ConfigCategory, paginationZod } from "@langfuse/shared";
import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import { Prisma, type ScoreConfig } from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { isPrismaException } from "@/src/utils/exceptions";

const ScoreConfigsGetSchema = z.object({
  ...paginationZod,
});

type CastedConfig = Omit<ScoreConfig, "categories"> & {
  categories: ConfigCategory[] | null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  try {
    // CHECK AUTH
    const authCheck = await verifyAuthHeaderAndReturnScope(
      req.headers.authorization,
    );
    if (!authCheck.validKey) {
      return res.status(401).json({
        message: authCheck.error,
      });
    }
    // END CHECK AUTH

    if (req.method !== "GET") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    if (req.method === "GET") {
      if (authCheck.scope.accessLevel !== "all") {
        return res.status(401).json({
          message: "Access denied - need to use basic auth with secret key",
        });
      }

      const obj = ScoreConfigsGetSchema.parse(req.query);

      const skipValue = (obj.page - 1) * obj.limit;

      const configs = (await prisma.$queryRaw<Array<ScoreConfig>>(Prisma.sql`
          SELECT
            *
          FROM 
            "score_configs" AS sc
          WHERE 
            sc.project_id = ${authCheck.scope.projectId}
          ORDER BY 
            sc."createdAt" DESC
          LIMIT ${obj.limit} OFFSET ${skipValue}
          `)) as CastedConfig[];

      const totalItemsRes = await prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`
          SELECT 
            COUNT(*) as count
          FROM 
            "score_configs" AS sc
          WHERE sc.project_id = ${authCheck.scope.projectId}
        `,
      );

      const totalItems =
        totalItemsRes[0] !== undefined ? Number(totalItemsRes[0].count) : 0;

      return res.status(200).json({
        data: configs,
        meta: {
          page: obj.page,
          limit: obj.limit,
          totalItems,
          totalPages: Math.ceil(totalItems / obj.limit),
        },
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
